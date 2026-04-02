function toolNode(id, toolName, options) {
    return {
        kind: 'tool',
        id,
        toolName,
        input: options?.input,
        retry: options?.retry,
        timeoutMs: options?.timeoutMs,
    };
}
function sequenceNode(id, steps) {
    return { kind: 'sequence', id, steps };
}
function branchNode(id, predicateId, whenTrue, whenFalse, predicateFn) {
    return { kind: 'branch', id, predicateId, predicateFn, whenTrue, whenFalse };
}
const workflowId = 'workflow.temp-mail-open-latest.v1';
const tempMailOpenLatestWorkflow = {
    kind: 'workflow-contract',
    version: 1,
    id: workflowId,
    displayName: 'Temp Mail Open Latest',
    description: 'Navigate a temporary mailbox, optionally refresh it, and open the latest relevant message using configurable selectors and matching rules.',
    tags: ['workflow', 'mailbox', 'email', 'temp-mail', 'automation'],
    timeoutMs: 3 * 60_000,
    defaultMaxConcurrency: 1,
    build(ctx) {
        const prefix = 'workflows.tempMailOpenLatest';
        const mailboxUrl = ctx.getConfig(`${prefix}.mailboxUrl`, 'https://example.com/mailbox');
        const waitUntil = ctx.getConfig(`${prefix}.waitUntil`, 'networkidle');
        const readySelector = ctx.getConfig(`${prefix}.readySelector`, 'body');
        const timeoutMs = ctx.getConfig(`${prefix}.timeoutMs`, 60_000);
        const refreshSelector = ctx.getConfig(`${prefix}.refreshSelector`, '');
        const refreshWaitMs = ctx.getConfig(`${prefix}.refreshWaitMs`, 1500);
        const itemSelector = ctx.getConfig(`${prefix}.itemSelector`, 'a[href]');
        const hrefIncludes = ctx.getConfig(`${prefix}.hrefIncludes`, '/mail/view/');
        const hrefRegex = ctx.getConfig(`${prefix}.hrefRegex`, '');
        const textIncludes = ctx.getConfig(`${prefix}.textIncludes`, '');
        const textRegex = ctx.getConfig(`${prefix}.textRegex`, '');
        const openOrder = ctx.getConfig(`${prefix}.openOrder`, 'first');
        const maybeRefresh = branchNode('maybe-refresh-mailbox', 'temp_mail_open_latest_enable_refresh', sequenceNode('refresh-sequence', [
            toolNode('refresh-mailbox', 'page_evaluate', {
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
            }),
            toolNode('wait-after-refresh', 'page_evaluate', {
                input: {
                    code: `new Promise(resolve => setTimeout(() => resolve({ waitedMs: ${Math.max(0, refreshWaitMs)} }), ${Math.max(0, refreshWaitMs)}))`,
                },
                timeoutMs: Math.max(5_000, refreshWaitMs + 2_000),
            }),
        ]), toolNode('skip-refresh-mailbox', 'console_execute', {
            input: {
                expression: '({ skipped: true, step: "refresh_mailbox", reason: "refreshSelector not configured" })',
            },
        }), () => Boolean(refreshSelector));
        const openLatest = toolNode('open-latest-relevant-mail', 'page_evaluate', {
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
        });
        return sequenceNode('temp-mail-open-latest-root', [
            toolNode('navigate-mailbox', 'page_navigate', {
                input: {
                    url: mailboxUrl,
                    waitUntil,
                    timeout: timeoutMs,
                    enableNetworkMonitoring: true,
                },
            }),
            toolNode('wait-mailbox-ready', 'page_wait_for_selector', {
                input: {
                    selector: readySelector,
                    timeout: timeoutMs,
                },
            }),
            maybeRefresh,
            openLatest,
            toolNode('emit-summary', 'console_execute', {
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
            }),
        ]);
    },
    onStart(ctx) {
        ctx.emitMetric('workflow_runs_total', 1, 'counter', {
            workflowId,
            stage: 'start',
        });
    },
    onFinish(ctx) {
        ctx.emitMetric('workflow_runs_total', 1, 'counter', {
            workflowId,
            stage: 'finish',
        });
    },
    onError(ctx, error) {
        ctx.emitMetric('workflow_errors_total', 1, 'counter', {
            workflowId,
            error: error.name,
        });
    },
};
export default tempMailOpenLatestWorkflow;
