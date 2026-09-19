import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import CoachWorkoutCard from '@/components/CoachWorkoutCard';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Trash2, Dumbbell, Apple, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  { icon: Dumbbell, text: 'What should I do for today\'s workout?' },
  { icon: Apple, text: 'What should I eat after my workout?' },
  { icon: Apple, text: 'Give me a high-protein breakfast' },
  { icon: TrendingUp, text: 'How am I progressing?' },
];

// Removes markdown symbols so older messages (and any stray ones) read as plain text.
function cleanText(s = '') {
  return String(s)
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function Coach() {
  const { profile } = useProfile();
  const unit = profile?.units === 'metric' ? 'kg' : 'lb';
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const messagesRef = useRef([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    supabase.from('ai_conversations').select('*').order('created_at', { ascending: false }).limit(1).then(({ data: list }) => {
      if (list?.[0]) { setConversation(list[0]); setMessages(list[0].messages || []); }
    });
  }, []);

  // Only scroll when a message is added, not while typing into a workout card.
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, sending]);

  const send = async (text) => {
    text = (text ?? input).trim();
    if (!text || sending) return;
    setInput('');
    const userMsg = { role: 'user', content: text, created_date: new Date().toISOString() };
    setMessages(m => [...m, userMsg]);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-coach-chat', { body: { message: text, conversationId: conversation?.id } });
      if (error || data?.error) { setMessages(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong: ' + (data?.error || error.message) }]); }
      else {
        setMessages(data.conversation.messages || []);
        setConversation(data.conversation);
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + e.message }]);
    } finally { setSending(false); }
  };

  // Updates one workout card. `persist` also saves the chat so progress survives a reload.
  const updateWorkout = (index, workout, persist = false) => {
    const next = messagesRef.current.map((m, i) => i === index ? { ...m, workout } : m);
    messagesRef.current = next;
    setMessages(next);
    if (persist && conversation?.id) {
      supabase.from('ai_conversations').update({ messages: next }).eq('id', conversation.id).then(() => {});
    }
  };

  const newChat = async () => {
    setConversation(null); setMessages([]);
  };

  const deleteChat = async () => {
    if (conversation) { await supabase.from('ai_conversations').delete().eq('id', conversation.id); }
    newChat();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
          <div><h1 className="text-xl font-bold font-heading leading-none">AI Coach</h1><p className="text-xs text-muted-foreground">Knows your training & nutrition</p></div>
        </div>
        <div className="flex gap-1">
          <button onClick={newChat} className="text-xs text-primary font-semibold px-2 py-1">New</button>
          {conversation && <button onClick={deleteChat} className="text-muted-foreground p-1"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-2 no-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4"><Sparkles className="w-8 h-8 text-primary" /></div>
            <p className="font-semibold">Ask your coach anything</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Workouts, nutrition, recovery, progress — I have your context.</p>
            <div className="grid grid-cols-2 gap-2 w-full">
              {SUGGESTIONS.map(s => {
                const Icon = s.icon;
                return <button key={s.text} onClick={() => send(s.text)} className="text-left p-3 rounded-xl bg-card border border-border text-sm font-medium active:scale-[0.98] transition flex items-start gap-2"><Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />{s.text}</button>;
              })}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="space-y-3">
              {m.content && (
                <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap', m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md')}>
                    {m.role === 'user' ? m.content : cleanText(m.content)}
                  </div>
                </div>
              )}
              {m.workout && <CoachWorkoutCard workout={m.workout} unit={unit} onChange={(w, persist) => updateWorkout(i, w, persist)} />}
            </div>
          ))
        )}
        {sending && <div className="flex justify-start"><div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex gap-1"><span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div></div>}
        <div ref={scrollRef} />
      </div>

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message your coach..." className="flex-1 h-12 rounded-xl border border-input bg-card px-4 text-sm" />
        <Button onClick={() => send()} disabled={sending || !input} className="rounded-xl h-12 w-12 p-0"><Send className="w-5 h-5" /></Button>
      </div>
    </div>
  );
}
