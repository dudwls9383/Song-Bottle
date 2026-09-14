import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bot,
  ArrowRight,
  CircleHelp,
  ExternalLink,
  History,
  MessageCircle,
  Music2,
  Send,
  ShieldAlert,
  Waves,
  X,
} from 'lucide-react';
import type { Page } from './types';

type Answer = {
  id: string;
  label: string;
  icon: ReactNode;
  keywords: string[];
  answer: string;
  action?: { label: string; page: Page };
};
type ChatMessage = { id: string; from: 'bot' | 'user'; text: string; action?: Answer['action'] };

const answers: Answer[] = [
  {
    id: 'send',
    label: '노래는 어떻게 보내요?',
    icon: <Music2 size={15} />,
    keywords: ['보내', '전송', '노래', '링크', '유튜브', '스포티파이', '애플', '사운드클라우드'],
    answer:
      '홈에서 음악 링크를 붙여넣고 장르를 고른 뒤 보틀 띄우기를 누르면 돼요. YouTube, Spotify, Apple Music, SoundCloud의 개별 곡 링크를 지원해요.',
    action: { label: '홈으로 가기', page: 'home' },
  },
  {
    id: 'waiting',
    label: '보틀이 안 와요',
    icon: <Waves size={15} />,
    keywords: ['안와', '안 와', '대기', '표류', '매칭', '언제', '기다'],
    answer:
      '같은 장르와 같은 해류 코드를 고른 다른 사용자가 있어야 교환돼요. 해류 코드를 비우면 모두의 바다로 가고, 순수 랜덤을 고르면 같은 선택을 한 사람과 장르 제한 없이 만나요. 대기 보틀은 최대 7일 동안 유지돼요.',
    action: { label: '교환 기록 보기', page: 'history' },
  },
  {
    id: 'current',
    label: '해류 코드가 뭐예요?',
    icon: <Waves size={15} />,
    keywords: ['해류', '코드', '비공개', '친구', '방'],
    answer:
      '해류 코드는 같은 코드를 입력한 사람끼리 만나게 하는 작은 방 이름이에요. 친구와 같은 코드와 같은 장르를 고르면 서로 매칭될 수 있고, 비워두면 공개 바다에서 매칭돼요.',
  },
  {
    id: 'history',
    label: '받은 노래는 어디서 봐요?',
    icon: <History size={15} />,
    keywords: ['받은', '기록', '어디', '확인', '도착', '플레이리스트'],
    answer:
      '교환 기록에서 내가 보낸 곡과 받은 곡을 볼 수 있어요. 다시 듣고 싶은 곡은 플레이리스트 탭에서 검색하거나 즐겨찾기할 수 있어요.',
    action: { label: '교환 기록 보기', page: 'history' },
  },
  {
    id: 'share',
    label: '공유 카드는 어떻게 만들어요?',
    icon: <ExternalLink size={15} />,
    keywords: ['공유', '카드', '이미지', '다운로드', 'png'],
    answer:
      '교환이 완료된 보틀을 열고 받은 노래 상세 화면에서 공유 카드 만들기를 누르면 PNG 이미지가 내려받아져요. 해류 코드나 개인 메시지는 카드에 넣지 않아요.',
    action: { label: '교환 기록 보기', page: 'history' },
  },
  {
    id: 'report',
    label: '이상한 링크는 어떻게 해요?',
    icon: <ShieldAlert size={15} />,
    keywords: ['신고', '이상', '부적절', '숨김', '차단', '링크'],
    answer:
      '받은 보틀 상세 화면에서 신고하기를 누르면 해당 보틀이 내 화면에서 숨겨져요. 신고된 교환은 모두의 바다 공개 소식에도 나오지 않아요.',
  },
  {
    id: 'community',
    label: '커뮤니티는 뭐 하는 곳이에요?',
    icon: <MessageCircle size={15} />,
    keywords: ['커뮤니티', '게시판', '글', '좋아요', '디시'],
    answer:
      '커뮤니티는 노래를 기다리는 동안 짧은 익명 글을 남기는 곳이에요. 무드 태그를 붙일 수 있고, 마음에 드는 글에는 좋아요를 누를 수 있어요.',
    action: { label: '커뮤니티 열기', page: 'community' },
  },
  {
    id: 'monitoring',
    label: '모니터링은 뭘 보여줘요?',
    icon: <CircleHelp size={15} />,
    keywords: ['모니터링', '통계', '그래프', '수치', '장르', '태그', '플랫폼'],
    answer:
      '모니터링 탭에서는 전체 보틀 수, 교환 수, 매칭률, 장르/태그/플랫폼 사용량, 최근 7일 교환량을 볼 수 있어요. 곡 URL, 메시지, 해류 코드는 공개하지 않아요.',
    action: { label: '모니터링 보기', page: 'monitoring' },
  },
];

const hello: ChatMessage = {
  id: 'hello',
  from: 'bot',
  text: '안녕하세요. Song Bottle 이용 중 막히는 부분을 빠르게 찾아드릴게요. 아래 질문을 누르거나 직접 물어보세요.',
};

function findAnswer(question: string) {
  const compact = question.toLowerCase().replace(/\s/g, '');
  const scored = answers
    .map((answer) => ({
      answer,
      score: answer.keywords.filter((keyword) =>
        compact.includes(keyword.toLowerCase().replace(/\s/g, '')),
      ).length,
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].answer : null;
}

export default function HelpChat({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(''),
    [messages, setMessages] = useState<ChatMessage[]>([hello]);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => answers.slice(0, 6), []);

  function reply(answer: Answer | null) {
    const next = answer || {
      id: 'fallback',
      answer:
        '아직 그 질문은 준비된 답변이 없어요. 노래 보내기, 매칭, 해류 코드, 신고, 공유 카드, 커뮤니티, 모니터링처럼 물어보면 더 잘 찾아드려요.',
    };
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        from: 'bot',
        text: next.answer,
        action: answer?.action,
      },
    ]);
    setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 0);
  }

  function ask(text: string) {
    const question = text.trim();
    if (!question) return;
    setMessages((items) => [...items, { id: crypto.randomUUID(), from: 'user', text: question }]);
    setInput('');
    setTimeout(() => reply(findAnswer(question)), 120);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(input);
  }

  return (
    <div className={`help-chat ${open ? 'open' : ''}`}>
      {open && (
        <section className="help-chat-panel" aria-label="도움말 챗봇">
          <header>
            <div>
              <span>
                <Bot size={17} />
              </span>
              <div>
                <strong>도움말 챗봇</strong>
                <small>API 없이 준비된 답변으로 안내해요</small>
              </div>
            </div>
            <button className="icon-button" aria-label="도움말 닫기" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </header>
          <div className="help-suggestions" aria-label="추천 질문">
            {suggestions.map((item) => (
              <button key={item.id} onClick={() => ask(item.label)}>
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          <div className="help-messages">
            {messages.map((message) => (
              <div className={`help-message ${message.from}`} key={message.id}>
                <p>{message.text}</p>
                {message.action && (
                  <button
                    onClick={() => {
                      onNavigate(message.action!.page);
                      setOpen(false);
                    }}
                  >
                    {message.action.label}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form className="help-input" onSubmit={submit}>
            <input
              aria-label="도움말 질문"
              placeholder="예: 보틀이 안 와요"
              value={input}
              maxLength={80}
              onChange={(event) => setInput(event.target.value)}
            />
            <button aria-label="질문 보내기" disabled={!input.trim()} type="submit">
              <Send size={17} />
            </button>
          </form>
        </section>
      )}
      <button
        className="help-chat-toggle"
        aria-label={open ? '도움말 챗봇 닫기' : '도움말 챗봇 열기'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </div>
  );
}
