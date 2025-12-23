# D&D Rules Engine Integration Plan

## Overview

This document outlines the plan to integrate the **ChatRPG backend** (located at the repository root) as a rules engine for the **agentsanddragons** Next.js application. The backend provides 50+ D&D 5e tools via an MCP server with HTTP endpoints, and we will create a new page in the agentsanddragons app that leverages these tools through LangChain and the Vercel AI SDK.

## Goals

1. **Create a new integrated page** (`/rules_engine`) that uses the backend as the authoritative D&D 5e rules engine
2. **Leverage existing AI infrastructure** from agentsanddragons (Vercel AI SDK, LangChain, Together AI)
3. **Maintain consistency** with existing page patterns and UI components
4. **Enable seamless tool calling** from the AI agent to the backend rules engine
5. **Add navigation** to the new page in the top navbar

## Architecture Analysis

### Backend (Root Level)
- **Type**: MCP (Model Context Protocol) Server
- **Transport**: HTTP/SSE endpoints
- **Key Endpoints**:
  - `POST /tool` - Direct tool calls (bypasses MCP protocol)
  - `GET /tools` - List all available tools
  - `GET /health` - Health check
  - `GET /sse` - SSE endpoint for MCP protocol (not needed for our use case)
- **Tool Categories**:
  - Character Management (create, get, update, delete, level_up, take_rest, etc.)
  - Combat System (create_encounter, execute_action, advance_turn, etc.)
  - Magic System (manage_concentration, manage_aura, use_scroll, etc.)
  - Spatial Mechanics (measure_distance, calculate_aoe, check_line_of_sight, etc.)
  - World & Session (manage_location, move_party, manage_inventory, etc.)
  - Dice Rolling (roll_dice, roll_check, roll_death_save)
- **Output Format**: Markdown with ASCII art formatting
- **Port**: Configurable via `PORT` env var (default: 8080)

### agentsanddragons (Next.js App)
- **Framework**: Next.js 15 with App Router
- **AI Stack**: 
  - Vercel AI SDK (`ai` package)
  - LangChain.js
  - LangGraph for agents
  - Together AI for LLM
- **Existing Patterns**:
  - Pages use `ChatWindow` component for chat interfaces
  - API routes in `app/api/chat/` handle streaming responses
  - Agents use `createReactAgent` from LangGraph
  - Tools are LangChain tool instances
- **UI Components**: 
  - `ChatWindow` - Main chat interface
  - `ChatMessageBubble` - Message display
  - `IntermediateStep` - Tool call visualization
  - Navbar with `ActiveLink` components

### web-client (Reference)
- Simple HTML/JS client that connects via SSE
- Uses OpenAI/Together AI APIs
- Connects to backend `/sse` endpoint
- **Note**: We won't use SSE, but will use direct `/tool` endpoint calls

## Integration Approach

### Option 1: LangChain Dynamic Tools (Recommended)
Create LangChain tools dynamically from the backend's `/tools` endpoint. Each tool will make HTTP POST requests to `/tool` endpoint.

**Pros**:
- Dynamic tool discovery (automatically gets all tools from backend)
- Type-safe with LangChain tool interface
- Works seamlessly with LangGraph agents
- Easy to maintain (backend changes automatically reflected)

**Cons**:
- Requires backend to be running
- Network latency for tool calls

### Option 2: Static Tool Wrappers
Manually create LangChain tool wrappers for each backend tool.

**Pros**:
- No dependency on backend at build time
- Can add custom validation/transformation

**Cons**:
- Manual maintenance when backend adds/removes tools
- More code to maintain

**Decision**: Use **Option 1** (Dynamic Tools) for flexibility and maintainability.

## Implementation Plan

### Phase 1: Backend Integration Layer

#### 1.1 Create Backend Client Utility
**File**: `agentsanddragons/utils/rulesEngineClient.ts`

**Purpose**: Centralized client for communicating with the backend rules engine.

**Features**:
- Configuration for backend URL (env var: `RULES_ENGINE_URL`, default: `http://localhost:8080`)
- Health check function
- Tool listing function (`GET /tools`)
- Tool execution function (`POST /tool`)
- Error handling and retry logic
- Type definitions for tool schemas

**API**:
```typescript
class RulesEngineClient {
  async healthCheck(): Promise<boolean>
  async listTools(): Promise<ToolDefinition[]>
  async callTool(name: string, args: Record<string, any>): Promise<CallToolResult>
}
```

#### 1.2 Create LangChain Tool Factory
**File**: `agentsanddragons/utils/rulesEngineTools.ts`

**Purpose**: Convert backend tool definitions into LangChain tool instances.

**Features**:
- Fetch tools from backend
- Convert JSON Schema to LangChain tool schemas
- Create dynamic tool instances
- Handle tool execution with proper error handling

**API**:
```typescript
async function createRulesEngineTools(
  client: RulesEngineClient
): Promise<StructuredTool[]>
```

### Phase 2: API Route

#### 2.1 Create Chat API Route
**File**: `agentsanddragons/app/api/chat/rules_engine/route.ts`

**Purpose**: Handle chat requests and route tool calls to the backend.

**Features**:
- Use LangGraph `createReactAgent` (similar to `/agents` route)
- Initialize rules engine tools dynamically
- Stream responses using Vercel AI SDK
- Support intermediate steps toggle
- Use D&D-specific system prompt

**Pattern**: Follow the structure of `app/api/chat/agents/route.ts`

**Key Differences**:
- Tools come from backend instead of hardcoded (Calculator, SerpAPI)
- System prompt focused on D&D 5e rules
- Error handling for backend connectivity issues

### Phase 3: Frontend Page

#### 3.1 Create Rules Engine Page
**File**: `agentsanddragons/app/rules_engine/page.tsx`

**Purpose**: Main page component for the rules engine integration.

**Features**:
- Use `ChatWindow` component (consistent with other pages)
- Provide informative empty state
- Show connection status to backend
- Display available tools count

**Pattern**: Follow the structure of `app/agents/page.tsx`

#### 3.2 Update Navbar
**File**: `agentsanddragons/app/layout.tsx`

**Changes**:
- Add new `ActiveLink` for `/rules_engine` route
- Use appropriate emoji/icon (e.g., 🎲 or ⚔️)
- Position appropriately in navigation

### Phase 4: Configuration & Environment

#### 4.1 Environment Variables
**File**: `.env.local` (or `.env.example`)

**Variables**:
- `RULES_ENGINE_URL` - Backend URL (default: `http://localhost:8080`)
- `RULES_ENGINE_TIMEOUT` - Request timeout in ms (default: 30000)

#### 4.2 Error Handling
- Backend unavailable: Show friendly error message
- Tool call failures: Display error in chat
- Network issues: Retry logic with exponential backoff

### Phase 5: Testing & Validation

#### 5.1 Manual Testing Checklist
- [ ] Backend health check works
- [ ] Tool listing retrieves all tools
- [ ] Character creation tool works
- [ ] Combat encounter tools work
- [ ] Dice rolling tools work
- [ ] Error handling for offline backend
- [ ] Streaming responses work correctly
- [ ] Intermediate steps display correctly
- [ ] Navigation link works

#### 5.2 Integration Tests
- Test tool execution with various parameters
- Test error scenarios (invalid tool, missing args, backend down)
- Test concurrent tool calls
- Test streaming with tool calls

## Technical Considerations

### 1. Tool Schema Conversion
**Challenge**: Backend uses JSON Schema, LangChain expects Zod schemas or JSON Schema.

**Solution**: Use LangChain's `StructuredTool` with JSON Schema directly, or convert to Zod if needed.

### 2. Streaming with Tool Calls
**Challenge**: Backend returns complete responses, but we want to stream AI responses.

**Solution**: 
- Stream AI model responses normally
- When tool is called, execute synchronously and inject result into stream
- Use LangGraph's `streamEvents` API (already used in agents route)

### 3. Backend Dependency
**Challenge**: Frontend depends on backend being available.

**Solution**:
- Graceful degradation: Show error message if backend unavailable
- Health check indicator in UI
- Configuration for backend URL
- Consider adding backend status to page

### 4. Tool Response Formatting
**Challenge**: Backend returns markdown with ASCII art, need to display properly.

**Solution**:
- Use existing markdown rendering in `ChatMessageBubble`
- Ensure ASCII art displays correctly (monospace font)
- Test with various backend responses

### 5. CORS Configuration
**Challenge**: Backend may need CORS headers for Next.js requests.

**Solution**: Backend already has CORS headers configured (`Access-Control-Allow-Origin: *`), but verify in production.

### 6. Type Safety
**Challenge**: Dynamic tools mean less compile-time type safety.

**Solution**:
- Use TypeScript with `any` for tool args (runtime validation by backend)
- Add runtime validation in tool wrapper
- Document tool schemas in code comments

## File Structure

```
agentsanddragons/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── rules_engine/
│   │           └── route.ts          # NEW: API route for rules engine chat
│   ├── rules_engine/
│   │   └── page.tsx                   # NEW: Main page component
│   └── layout.tsx                     # MODIFY: Add navbar link
├── utils/
│   ├── rulesEngineClient.ts           # NEW: Backend client utility
│   └── rulesEngineTools.ts            # NEW: LangChain tool factory
└── .env.local                         # MODIFY: Add RULES_ENGINE_URL
```

## Dependencies

### New Dependencies
None required - all needed packages are already in `package.json`:
- `@langchain/core` - For tool interfaces
- `@langchain/langgraph` - For agent creation
- `ai` - For streaming responses
- `zod` - Already used for validation

### Backend Requirements
- Backend must be running and accessible
- Backend must expose `/tool` and `/tools` endpoints
- Backend must have CORS enabled (already configured)

## System Prompt

Create a D&D-specific system prompt that:
- Explains the agent is a D&D 5e rules engine assistant
- Instructs to use available tools for all game mechanics
- Encourages accurate rule interpretation
- Provides context about available tool categories

**File**: `agentsanddragons/data/SystemPrompts.ts` (add new prompt)

## Future Enhancements

### Phase 6: Advanced Features (Post-MVP)

1. **Tool Discovery UI**
   - Display available tools in sidebar
   - Search/filter tools
   - Show tool descriptions and schemas

2. **Session Persistence**
   - Save conversation state
   - Persist character/encounter data
   - Resume sessions

3. **Battlefield Visualization**
   - Integrate with backend's `render_battlefield` tool
   - Display ASCII art battlefield in UI
   - Real-time updates via WebSocket (if backend supports)

4. **Character Sheet Display**
   - Parse character data from tool responses
   - Display formatted character sheets
   - Use existing `CharacterSheet` component if available

5. **Tool Call History**
   - Show history of tool calls
   - Allow re-execution of previous calls
   - Export tool call logs

6. **Backend Status Dashboard**
   - Show backend health
   - Display active encounters
   - Show tool usage statistics

7. **Multi-User Support**
   - Session management
   - Shared encounters
   - Party management UI

## Risk Assessment

### High Risk
- **Backend availability**: Mitigate with health checks and graceful errors
- **Tool schema compatibility**: Test thoroughly with all tool types

### Medium Risk
- **Performance**: Multiple tool calls may be slow. Consider caching tool definitions
- **Error handling**: Complex error scenarios need robust handling

### Low Risk
- **UI consistency**: Following existing patterns minimizes risk
- **Type safety**: Runtime validation compensates for dynamic nature

## Success Criteria

1. ✅ New `/rules_engine` page accessible from navbar
2. ✅ AI agent can call backend tools successfully
3. ✅ Character creation works end-to-end
4. ✅ Combat encounter tools work correctly
5. ✅ Dice rolling functions properly
6. ✅ Error handling works for offline backend
7. ✅ Streaming responses work smoothly
8. ✅ UI is consistent with existing pages
9. ✅ All 50+ backend tools are accessible

## Timeline Estimate

- **Phase 1** (Backend Integration): 4-6 hours
- **Phase 2** (API Route): 2-3 hours
- **Phase 3** (Frontend Page): 2-3 hours
- **Phase 4** (Configuration): 1 hour
- **Phase 5** (Testing): 3-4 hours

**Total**: ~12-17 hours

## Next Steps

1. Review and approve this plan
2. Set up backend locally and verify endpoints
3. Create `.env.local` with `RULES_ENGINE_URL`
4. Implement Phase 1 (Backend Client)
5. Implement Phase 2 (API Route)
6. Implement Phase 3 (Frontend Page)
7. Test end-to-end functionality
8. Deploy and verify

---

**Document Version**: 1.0  
**Last Updated**: 2025  
**Author**: Integration Planning

