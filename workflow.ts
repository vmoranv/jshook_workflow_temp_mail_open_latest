import {
  createWorkflow,
  type WorkflowExecutionContext,
  SequenceNodeBuilder,
  ToolNodeBuilder,
} from '@jshookmcp/extension-sdk/workflow';

const workflowId = 'workflow.temp-mail-open-latest.v1';

export default createWorkflow(workflowId, 'Temp Mail Open Latest')
  .description(
    'Navigate a temporary mailbox, optionally refresh it, and open the latest relevant message using configurable selectors and matching rules.',
  )
  .tags(['workflow', 'mailbox', 'email', 'temp-mail', 'automation'])
  .timeoutMs(3 * 60_000)
  .defaultMaxConcurrency(1)
  .buildGraph((ctx: WorkflowExecutionContext) => {
    const prefix = 'workflows.tempMailOpenLatest';
    const mailboxUrl = String(
      ctx.getConfig(`${prefix}.mailboxUrl`, 'https://example.com/mailbox'),
    );
    const waitUntil = String(ctx.getConfig(`${prefix}.waitUntil`, 'networkidle'));
    const readySelector = String(ctx.getConfig(`${prefix}.readySelector`, 'body'));
    const timeoutMs = Number(ctx.getConfig(`${prefix}.timeoutMs`, 60_000));
    const refreshSelector = String(ctx.getConfig(`${prefix}.refreshSelector`, ''));
    const refreshWaitMs = Number(ctx.getConfig(`${prefix}.refreshWaitMs`, 1500));
    const itemSelector = String(ctx.getConfig(`${prefix}.itemSelector`, 'a[href]'));
    const hrefIncludes = String(ctx.getConfig(`${prefix}.hrefIncludes`, '/mail/view/'));
    const hrefRegex = String(ctx.getConfig(`${prefix}.hrefRegex`, ''));
    const textIncludes = String(ctx.getConfig(`${prefix}.textIncludes`, ''));
    const textRegex = String(ctx.getConfig(`${prefix}.textRegex`, ''));
    const openOrder = String(ctx.getConfig(`${prefix}.openOrder`, 'first'));

    const root = new SequenceNodeBuilder('temp-mail-open-latest-root');

    root
      .tool('navigate-mailbox', 'page_navigate', {
        input: {
          url: mailboxUrl,
          waitUntil,
          timeout: timeoutMs,
          enableNetworkMonitoring: true,
        },
      })
      .tool('wait-mailbox-ready', 'page_wait_for_selector', {
        input: {
          selector: readySelector,
          timeout: timeoutMs,
        },
      })
      .branch('maybe-refresh-mailbox', 'temp_mail_open_latest_enable_refresh', (b) => {
        b.predicateFn(() => Boolean(refreshSelector))
          .whenTrue(
            new SequenceNodeBuilder('refresh-sequence')
              .tool('refresh-mailbox', 'page_evaluate', {
                input: {
                  code: `(function(){
              const target = document.querySelector(${JSON.stringify(refreshSelector)});
              if (!target) {
                return { refreshed: false, reason: 'refresh_target_not_found', selector: ${JSON.stringify(refreshSelector)} };
              }
              if (typeof target.click === 'function') {
                target.click();
                return { refreshed: true, selector: ${JSON.stringify(refreshSelector)} };
              }
              return { refreshed: false, reason: 'refresh_target_not_clickable', selector: ${JSON.stringify(refreshSelector)} };
            })()`,
                },
              })
              .tool('wait-after-refresh', 'page_evaluate', {
                input: {
                  code: `new Promise(resolve => setTimeout(() => resolve({ waitedMs: ${Math.max(0, refreshWaitMs)} }), ${Math.max(0, refreshWaitMs)}))`,
                },
                timeoutMs: Math.max(5_000, refreshWaitMs + 2_000),
              }),
          )
          .whenFalse(
            new ToolNodeBuilder('skip-refresh-mailbox', 'console_execute').input({
              expression:
                '({ skipped: true, step: "refresh_mailbox", reason: "refreshSelector not configured" })',
            }),
          );
      })
      .tool('open-latest-relevant-mail', 'page_evaluate', {
        input: {
          code: `(function(){
          const anchors = Array.from(document.querySelectorAll(${JSON.stringify(itemSelector)}));
          const hrefIncludes = ${JSON.stringify(hrefIncludes)};
          const hrefRegexRaw = ${JSON.stringify(hrefRegex)};
          const textIncludes = ${JSON.stringify(textIncludes)};
          const textRegexRaw = ${JSON.stringify(textRegex)};
          const order = ${JSON.stringify(openOrder)};

          const hrefRegex = hrefRegexRaw ? new RegExp(hrefRegexRaw, 'i') : null;
          const textRegex = textRegexRaw ? new RegExp(textRegexRaw, 'i') : null;

          const matches = anchors.filter((anchor) => {
            const href = anchor.href || anchor.getAttribute('href') || '';
            const text = (anchor.textContent || '').trim();
            if (hrefIncludes && !href.includes(hrefIncludes)) return false;
            if (hrefRegex && !hrefRegex.test(href)) return false;
            if (textIncludes && !text.toLowerCase().includes(textIncludes.toLowerCase())) return false;
            if (textRegex && !textRegex.test(text)) return false;
            return true;
          });

          if (matches.length === 0) {
            return {
              opened: false,
              reason: 'matching_mail_item_not_found',
              totalAnchors: anchors.length,
              filters: { hrefIncludes, hrefRegexRaw, textIncludes, textRegexRaw, order }
            };
          }

          const selected = order === 'last' ? matches[matches.length - 1] : matches[0];
          const href = selected.href || selected.getAttribute('href') || '';
          const text = (selected.textContent || '').trim();
          if (!href) {
            return {
              opened: false,
              reason: 'selected_item_missing_href',
              text,
              matchCount: matches.length
            };
          }

          window.location.href = href;
          return {
            opened: true,
            href,
            text,
            matchCount: matches.length,
            totalAnchors: anchors.length,
            order
          };
        })()`,
        },
      })
      .tool('emit-summary', 'console_execute', {
        input: {
          expression: `(${JSON.stringify({
            workflowId,
            mailboxUrl,
            readySelector,
            refreshSelector,
            itemSelector,
            hrefIncludes,
            hrefRegex,
            textIncludes,
            textRegex,
            openOrder,
            status: 'temp_mail_open_latest_complete',
          })})`,
        },
      });

    return root;
  })
  .onStart((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      stage: 'start',
    });
  })
  .onFinish((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      stage: 'finish',
    });
  })
  .onError((ctx, error) => {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', {
      workflowId,
      error: error.name,
    });
  })
  .build();
