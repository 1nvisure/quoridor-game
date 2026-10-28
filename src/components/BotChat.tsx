'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Avatar } from './ui/Avatar';
import type { BotProfile } from '@/lib/bots';
import type { ChatMessage } from '@/lib/chat';

/**
 * Opponent chat. Renders the bot's banter as speech bubbles; the newest line
 * also floats over the board as a transient bubble so it is impossible to miss.
 */
export function BotChat({
  bot,
  messages,
  typing,
  onSendTaunt,
}: {
  bot: BotProfile;
  messages: ChatMessage[];
  typing?: boolean;
  onSendTaunt?: (text: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, typing]);

  const visible = useMemo(() => messages.slice(-24), [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !onSendTaunt) return;
    onSendTaunt(text);
    setDraft('');
  };

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#8d8981]">
          <MessageCircle size={13} /> Chat
        </h2>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#6f6b64]">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {bot.name} is online
        </span>
      </div>

      <div
        ref={listRef}
        className="flex min-h-[132px] flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5"
        aria-live="polite"
        aria-label={`Chat with ${bot.name}`}
      >
        {visible.length === 0 && !typing && (
          <p className="m-auto max-w-[220px] text-center text-[11px] leading-relaxed text-[#6f6b64]">
            {bot.name} is sizing up the board. Say something.
          </p>
        )}

        {visible.map((m) =>
          m.from === 'system' ? (
            <div key={m.id} className="self-center rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold text-[#8d8981]">
              {m.text}
            </div>
          ) : (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex items-end gap-2"
            >
              <Avatar emoji={bot.emoji} gradient={bot.gradient} size={24} />
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/[0.07] bg-app-800 px-2.5 py-1.5">
                <p className="text-[11.5px] leading-snug text-[#e3dfd7]">{m.text}</p>
              </div>
            </motion.div>
          ),
        )}

        {typing && (
          <div className="flex items-end gap-2" aria-label={`${bot.name} is typing`}>
            <Avatar emoji={bot.emoji} gradient={bot.gradient} size={24} />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/[0.07] bg-app-800 px-3 py-2">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[#8d8981]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-white/[0.06] p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Talk to ${bot.name}…`}
          maxLength={80}
          aria-label="Chat message"
          className="focus-ring min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-app-900 px-2.5 py-1.5 text-[11.5px] text-[#e9e6df] placeholder:text-[#5d5a54]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send message"
          className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-[#12210a] transition-opacity disabled:opacity-35"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

/**
 * The floating speech bubble over the board. Auto-dismisses so it never covers
 * the position for long.
 */
export function SpeechBubble({
  bot,
  message,
  onDismiss,
}: {
  bot: BotProfile;
  message: ChatMessage;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(t);
  }, [message.id, onDismiss]);

  return (
    <AnimatePresence>
      <motion.button
        key={message.id}
        onClick={onDismiss}
        initial={{ opacity: 0, y: -8, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        className="absolute right-2 top-2 z-20 flex max-w-[78%] items-start gap-2 rounded-2xl rounded-tr-md border border-white/10 bg-app-750/95 px-2.5 py-2 text-left shadow-lg backdrop-blur"
        aria-live="polite"
      >
        <Avatar emoji={bot.emoji} gradient={bot.gradient} size={22} />
        <span className="text-[11.5px] font-medium leading-snug text-[#e9e6df]">{message.text}</span>
      </motion.button>
    </AnimatePresence>
  );
}

/** Compact inline version for the review screen. */
export function ChatHighlight({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-app-800 px-2.5 py-2">
      <Sparkles size={12} className="mt-0.5 shrink-0 text-brand" />
      <p className="text-[11.5px] italic leading-snug text-[#b7b3aa]">{message.text}</p>
    </div>
  );
}
