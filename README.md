# temp-mail-open-latest workflow

Declarative workflow for opening the latest relevant message in a temporary mailbox.

## Entry File

- `workflow.ts`

## Workflow ID

- `workflow.temp-mail-open-latest.v1`

## What It Does

- Navigates to a mailbox page
- Waits for an inbox-ready selector
- Optionally clicks a refresh button or trigger
- Waits for inbox updates to settle
- Scans mailbox anchors with configurable selectors and matching rules
- Opens the latest relevant message by navigating to its link
- Emits a small summary payload for downstream workflows or operators

## Tools Used

- `page_navigate`
- `page_wait_for_selector`
- `page_evaluate`
- `console_execute`

## Config

All config keys live under `workflows.tempMailOpenLatest.*`:

- `mailboxUrl`
- `waitUntil`
- `readySelector`
- `timeoutMs`
- `refreshSelector`
- `refreshWaitMs`
- `itemSelector`
- `hrefIncludes`
- `hrefRegex`
- `textIncludes`
- `textRegex`
- `openOrder` (`first` or `last`)

## Matching Strategy

A candidate anchor is selected from `itemSelector` and filtered by:

- href contains `hrefIncludes` (if provided)
- href matches `hrefRegex` (if provided)
- text contains `textIncludes` (if provided)
- text matches `textRegex` (if provided)

Then the workflow opens either the `first` or `last` matching item.

## Notes

- This workflow is intentionally provider-agnostic and is not tied to Qwen.
- It is designed to pair well with a separate link-extraction workflow on the message detail page.
