"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { LoaderCircle, RefreshCw, User, Swords, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/utils/cn";

interface StateResult {
  tool: string;
  content: string;
  timestamp: Date;
}

export function StateSidebar() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<StateResult[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [encounterId, setEncounterId] = useState("");

  const callTool = async (toolName: string, args: Record<string, unknown> = {}): Promise<void> => {
    setLoading(toolName);
    try {
      const response = await fetch("/api/mcp-tool", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toolName,
          args,
        }),
      });

      const data = (await response.json()) as { content?: string; error?: string; details?: string; suggestion?: string };

      if (!response.ok) {
        const errorMessage = data.error || data.details || "Failed to call tool";
        const suggestion = data.suggestion || "";
        throw new Error(suggestion ? `${errorMessage}\n\n${suggestion}` : errorMessage);
      }

      // Add result to the list
      setResults((prev) => [
        {
          tool: toolName,
          content: data.content,
          timestamp: new Date(),
        },
        ...prev,
      ]);

      toast.success(`Retrieved ${toolName.replace(/_/g, " ")}`);
    } catch (error) {
      console.error(`Error calling ${toolName}:`, error);
      toast.error(
        `Failed to retrieve ${toolName.replace(/_/g, " ")}`,
        {
          description: error instanceof Error ? error.message : "Unknown error",
        }
      );
    } finally {
      setLoading(null);
    }
  };

  const handleGetCharacter = () => {
    if (!characterId.trim()) {
      toast.error("Please enter a character ID or name");
      return;
    }
    const trimmed = characterId.trim();
    // Try as ID first, but the backend will also accept it as a name
    callTool("get_character", { characterId: trimmed });
  };

  const handleGetEncounter = () => {
    if (!encounterId.trim()) {
      toast.error("Please enter an encounter ID");
      return;
    }
    callTool("get_encounter", { encounterId: encounterId.trim() });
  };

  const handleGetSessionContext = () => {
    callTool("get_session_context", { format: "compact" });
  };

  return (
    <div className="w-80 border-l bg-muted/30 flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-4">State Retrieval</h2>
        
        {/* Get Character */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4" />
              Get Character
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Character ID or Name"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGetCharacter();
                }
              }}
            />
            <Button
              onClick={handleGetCharacter}
              disabled={loading === "get_character" || !characterId.trim()}
              className="w-full"
              size="sm"
            >
              {loading === "get_character" ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Retrieve
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Get Encounter */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Get Encounter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Encounter ID"
              value={encounterId}
              onChange={(e) => setEncounterId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGetEncounter();
                }
              }}
            />
            <Button
              onClick={handleGetEncounter}
              disabled={loading === "get_encounter" || !encounterId.trim()}
              className="w-full"
              size="sm"
            >
              {loading === "get_encounter" ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Retrieve
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Get Session Context */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Session Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGetSessionContext}
              disabled={loading === "get_session_context"}
              className="w-full"
              size="sm"
            >
              {loading === "get_session_context" ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Get Context
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Results ({results.length})
        </h3>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No results yet. Use the buttons above to retrieve state.
          </p>
        ) : (
          results.map((result, index) => (
            <Card key={index} className="text-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-mono">
                    {result.tool}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {result.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-muted p-2 rounded overflow-x-auto max-h-96 overflow-y-auto">
                  {result.content}
                </pre>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

