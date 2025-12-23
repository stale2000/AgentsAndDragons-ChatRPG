"use client";

import { cn } from "@/utils/cn";
import type { Message } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { LoaderCircle, Pause, Volume2 } from "lucide-react";
import { toast } from "sonner";

export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  sources: any[];
}) {
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function fetchAndPlay() {
    try {
      setIsLoadingAudio(true);
      console.log("[TTS][client] Requesting /api/tts", {
        textLength: props.message.content?.length,
        voice: "helpful woman",
      });
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: props.message.content, voice: "helpful woman" }),
      });
      const debugId = res.headers.get("x-debug-id");
      const togetherReqId = res.headers.get("x-together-request-id");
      console.log("[TTS][client] Response from /api/tts", {
        status: res.status,
        ok: res.ok,
        contentType: res.headers.get("content-type"),
        debugId,
        togetherReqId,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[TTS][client] /api/tts error payload", err);
        throw new Error(
          err?.error ||
            `TTS failed (${res.status})` +
              (err?.together_status ? ` together_status=${err.together_status}` : "") +
              (err?.together_request_id ? ` together_request_id=${err.together_request_id}` : "") +
              (err?.debug_id ? ` debug_id=${err.debug_id}` : ""),
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.onplay = () => console.log("[TTS][client] audio play");
      audio.onpause = () => console.log("[TTS][client] audio pause");
      audio.onerror = (e) => console.error("[TTS][client] audio error", e);
      await audio.play();
      setIsPlaying(true);
    } catch (e: any) {
      console.error("[TTS][client] Exception during fetch/play", e);
      toast.error("Could not generate audio", { description: e?.message });
    } finally {
      setIsLoadingAudio(false);
    }
  }

  async function togglePlayback() {
    if (!audioRef.current) {
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
        setIsPlaying(true);
      } else {
        await fetchAndPlay();
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (e: any) {
        toast.error("Playback error", { description: e?.message });
      }
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        `rounded-[24px] max-w-[80%] mb-8 flex`,
        props.message.role === "user"
          ? "bg-secondary text-secondary-foreground px-4 py-2"
          : null,
        props.message.role === "user" ? "ml-auto" : "mr-auto",
      )}
    >
      {props.message.role !== "user" && (
        <div className="mr-4 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          {props.aiEmoji}
        </div>
      )}

      <div className="whitespace-pre-wrap flex flex-col">
        <span>{props.message.content}</span>

        {props.sources && props.sources.length ? (
          <>
            <code className="mt-4 mr-auto bg-primary px-2 py-1 rounded">
              <h2>🔍 Sources:</h2>
            </code>
            <code className="mt-1 mr-2 bg-primary px-2 py-1 rounded text-xs">
              {props.sources?.map((source, i) => (
                <div className="mt-2" key={"source:" + i}>
                  {i + 1}. &quot;{source.pageContent}&quot;
                  {source.metadata?.loc?.lines !== undefined ? (
                    <div>
                      <br />
                      Lines {source.metadata?.loc?.lines?.from} to{" "}
                      {source.metadata?.loc?.lines?.to}
                    </div>
                  ) : (
                    ""
                  )}
                </div>
              ))}
            </code>
          </>
        ) : null}

        {props.message.role !== "user" && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlayback}
              disabled={isLoadingAudio}
              aria-label={isPlaying ? "Pause speech" : "Play speech"}
            >
              {isLoadingAudio ? (
                <LoaderCircle className="animate-spin" />
              ) : isPlaying ? (
                <Pause />
              ) : (
                <Volume2 />
              )}
              <span className="text-xs">
                {isLoadingAudio ? "Loading" : isPlaying ? "Pause" : "Listen"}
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
