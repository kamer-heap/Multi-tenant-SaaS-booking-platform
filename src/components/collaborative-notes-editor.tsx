"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { ApiClientError, getBooking, updateBookingNotes } from "@/lib/api";

type PresenceUser = { userId: string; name: string; color: string };
type SaveState = "saving" | "saved" | "offline" | "conflict";
type RemoteConflict = { notes: string; version: number };
type TypingPayload = { isTyping: boolean; userId: string; name: string };
type NotesSavedPayload = { version: number; notes: string; userId: string };
type JoinBookingAck = { joined?: boolean; userId?: string; name?: string; color?: string; error?: string };

const MAX_VISIBLE_AVATARS = 4;

function getRealtimeUrl(): string {
  return process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function typingLabel(users: string[]): string | null {
  if (!users.length) return null;
  if (users.length === 1) return `${users[0]} is typing...`;
  return `${users[0]} and ${users.length - 1} others are typing...`;
}

function conflictDetails(details: unknown): RemoteConflict | null {
  if (typeof details !== "object" || !details) return null;
  const candidate = details as { notes?: unknown; version?: unknown };
  if (typeof candidate.notes === "string" && typeof candidate.version === "number") {
    return { notes: candidate.notes, version: candidate.version };
  }
  return null;
}

export function CollaborativeNotesEditor({
  bookingId,
  initialNotes,
  initialVersion,
  onSynced,
}: {
  bookingId: string;
  initialNotes: string;
  initialVersion: number;
  onSynced?: (update: { notes: string; version: number }) => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [baseVersion, setBaseVersion] = useState(initialVersion);
  const [lastSyncedNotes, setLastSyncedNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [remoteConflict, setRemoteConflict] = useState<RemoteConflict | null>(null);
  const [connected, setConnected] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const notesRef = useRef(initialNotes);
  const versionRef = useRef(initialVersion);
  const lastSyncedRef = useRef(initialNotes);
  const myUserIdRef = useRef<string | null>(null);
  const onSyncedRef = useRef(onSynced);
  const persistNotesRef = useRef<(draft: string, version: number) => Promise<void>>(async () => undefined);
  const joinRoomAndSyncRef = useRef<(socket: Socket) => Promise<void>>(async () => undefined);

  const dirty = notes !== lastSyncedNotes;
  const canSync = connected && isBrowserOnline;
  const typingText = useMemo(() => typingLabel([...typingUsers.values()]), [typingUsers]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    versionRef.current = baseVersion;
  }, [baseVersion]);

  useEffect(() => {
    lastSyncedRef.current = lastSyncedNotes;
  }, [lastSyncedNotes]);

  useEffect(() => {
    myUserIdRef.current = myUserId;
  }, [myUserId]);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const persistNotes = useCallback(async (draft: string, version: number) => {
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return;
    }
    if (!canSync) {
      setSaveState("offline");
      return;
    }

    savingRef.current = true;
    setSaveState("saving");
    try {
      const saved = await updateBookingNotes(bookingId, { notes: draft, baseVersion: version });
      const currentInput = notesRef.current;
      setBaseVersion(saved.version);
      setLastSyncedNotes(saved.notes);
      setRemoteConflict(null);
      if (currentInput === draft) {
        setNotes(saved.notes);
        setSaveState("saved");
      }
      onSyncedRef.current?.({ notes: saved.notes, version: saved.version });
      socketRef.current?.emit("notes_saved", {
        version: saved.version,
        notes: saved.notes,
        userId: myUserIdRef.current ?? undefined,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "CONFLICT") {
        const details = conflictDetails(error.details);
        if (details) {
          setRemoteConflict(details);
          setSaveState("conflict");
          return;
        }
      }
      setSaveState("offline");
    } finally {
      savingRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void persistNotesRef.current(notesRef.current, versionRef.current);
      }
    }
  }, [bookingId, canSync]);

  const joinRoomAndSync = useCallback(async (socket: Socket) => {
    await new Promise<void>((resolve) => {
      socket.emit("join_booking", { bookingId }, (ack?: JoinBookingAck) => {
        if (ack?.error) {
          toast.error(ack.error);
        } else if (ack?.userId) {
          setMyUserId(ack.userId);
        }
        resolve();
      });
    });

    try {
      const latest = await getBooking(bookingId);
      if (notesRef.current !== lastSyncedRef.current) {
        setBaseVersion(latest.notesVersion);
        void persistNotesRef.current(notesRef.current, latest.notesVersion);
      } else {
        setNotes(latest.notes);
        setLastSyncedNotes(latest.notes);
        setBaseVersion(latest.notesVersion);
        setSaveState("saved");
      }
    } catch {
      setSaveState("offline");
    }
  }, [bookingId]);

  useEffect(() => {
    persistNotesRef.current = persistNotes;
    joinRoomAndSyncRef.current = joinRoomAndSync;
  }, [persistNotes, joinRoomAndSync]);

  useEffect(() => {
    const socket = io(getRealtimeUrl(), {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
    const typingTimers = typingTimeouts.current;
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setSaveState((current) => (current === "offline" && notesRef.current === lastSyncedRef.current ? "saved" : current));
      void joinRoomAndSyncRef.current(socket);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setSaveState("offline");
    });

    socket.on("presence", (users: PresenceUser[]) => {
      setPresence(users);
    });

    socket.on("typing", (payload: TypingPayload) => {
      if (!payload?.userId || payload.userId === myUserIdRef.current) return;
      setTypingUsers((current) => {
        const next = new Map(current);
        if (payload.isTyping) next.set(payload.userId, payload.name);
        else next.delete(payload.userId);
        return next;
      });
      const existing = typingTimers.get(payload.userId);
      if (existing) clearTimeout(existing);
      if (payload.isTyping) {
        typingTimers.set(
          payload.userId,
          setTimeout(() => {
            setTypingUsers((current) => {
              const next = new Map(current);
              next.delete(payload.userId);
              return next;
            });
            typingTimers.delete(payload.userId);
          }, 2000),
        );
      }
    });

    socket.on("notes_saved", (payload: NotesSavedPayload) => {
      if (!payload || payload.userId === myUserIdRef.current) return;
      if (notesRef.current !== lastSyncedRef.current) {
        setRemoteConflict({ notes: payload.notes, version: payload.version });
        setSaveState("conflict");
        return;
      }
      setNotes(payload.notes);
      setLastSyncedNotes(payload.notes);
      setBaseVersion(payload.version);
      setSaveState("saved");
      onSyncedRef.current?.({ notes: payload.notes, version: payload.version });
    });

    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      for (const timeout of typingTimers.values()) clearTimeout(timeout);
      socket.disconnect();
    };
  }, [bookingId]);

  useEffect(() => {
    const setOnline = () => {
      setIsBrowserOnline(true);
      if (socketRef.current?.connected) {
        void joinRoomAndSyncRef.current(socketRef.current);
      }
    };
    const setOffline = () => {
      setIsBrowserOnline(false);
      setSaveState("offline");
    };
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, [bookingId]);

  useEffect(() => {
    if (!dirty || remoteConflict) return;
    if (!canSync) return;
    const timer = setTimeout(() => {
      void persistNotesRef.current(notesRef.current, versionRef.current);
    }, 1000);
    return () => clearTimeout(timer);
  }, [dirty, notes, canSync, remoteConflict]);

  const onLocalTyping = (value: string) => {
    setNotes(value);
    setSaveState(canSync ? "saving" : "offline");
    socketRef.current?.emit("typing", { isTyping: true });
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      socketRef.current?.emit("typing", { isTyping: false });
    }, 2000);
  };

  const applyTheirs = () => {
    if (!remoteConflict) return;
    setNotes(remoteConflict.notes);
    setLastSyncedNotes(remoteConflict.notes);
    setBaseVersion(remoteConflict.version);
    setRemoteConflict(null);
    setSaveState("saved");
  };

  const keepMine = () => {
    if (!remoteConflict) return;
    const local = notesRef.current;
    const latest = remoteConflict.version;
    setLastSyncedNotes(remoteConflict.notes);
    setBaseVersion(latest);
    setRemoteConflict(null);
    setSaveState("saving");
    void persistNotesRef.current(local, latest);
  };

  const visible = presence.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = Math.max(0, presence.length - visible.length);
  const statusLabel =
    saveState === "saving"
      ? "Saving..."
      : saveState === "offline"
        ? "Offline - changes will sync"
        : saveState === "conflict"
          ? "Conflict"
          : "Saved just now";

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {(!connected || !isBrowserOnline) && (
        <div className="sticky top-0 z-10 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          You&apos;re offline. Reconnecting...
        </div>
      )}
      {remoteConflict && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Someone else updated these notes.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={keepMine}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Keep mine
            </button>
            <button
              type="button"
              onClick={applyTheirs}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Use theirs
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center -space-x-2">
          {visible.map((user) => (
            <div
              key={user.userId}
              title={user.name}
              className="flex size-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white"
              style={{ backgroundColor: user.color }}
            >
              {initials(user.name)}
            </div>
          ))}
          {overflow > 0 && (
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-semibold text-slate-700">
              +{overflow}
            </div>
          )}
        </div>
        <p className="text-xs font-medium text-slate-500">{statusLabel}</p>
      </div>
      <textarea
        value={notes}
        onChange={(event) => onLocalTyping(event.target.value)}
        rows={8}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        placeholder="Add collaborative notes..."
      />
      <p className="min-h-5 text-xs text-slate-500">{typingText ?? "\u00A0"}</p>
    </section>
  );
}
