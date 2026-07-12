
> @hamster-note/selection@0.0.0 typecheck
> tsc -b --noEmit

## Notes

- Added `src/linkedRegistry.ts` with a module-local `selectionId -> HTMLElement` registry.
- `registerLinkedContainer()` warns in development for duplicate ids and ignores later duplicate containers for linked calculations.
- `getRegisteredContainers()` sorts registry entries by DOM order via `Node.compareDocumentPosition`.
- `resolveEndpoint(node, offset)` finds the containing registered container and returns a local plain-text `SelectionEndpoint`.
- Linked `Selection` instances register on mount/effect run, unregister on cleanup, and synchronize `LinkedSelectionData.selectionOrder` through `onLinkedDataChange` when the DOM order changes.
