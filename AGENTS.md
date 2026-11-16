# AI UI Component & Design Rules

## Component Ecosystem
- **Primary AI Components:** `@ai-elements` registry (`https://elements.ai-sdk.dev/api/registry/{name}.json`, docs: `https://ui.shadcn.com/docs/ai-elements`) discovered via the `shadcn` MCP server.
- **Chat Runtime & Primitives:** `assistant-ui` (`https://www.assistant-ui.com/`, `@assistant-ui` registry & `assistant-ui` docs MCP server).
- **Base UI Primitives:** `@shadcn` registry (`https://ui.shadcn.com/docs/mcp`) for sidebars, navigation, dialogs, settings, search, loading, and error states.

## Design Requirements
- **Use:** Clean, modern, minimal interfaces; solid backgrounds and surfaces; neutral colors; strong, readable typography; subtle borders; consistent spacing; clear component hierarchy.
- **Avoid:** Glassmorphism (`backdrop-filter`/translucent glass cards), excessive gradients, generic AI-generated UI patterns, unnecessary animations, thin or low-contrast unreadable typography.
