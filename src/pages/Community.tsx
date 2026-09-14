import { useEffect, useState, type FormEvent } from 'react';
import { Heart, LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import { COMMUNITY_POST_LIMIT, MOODS } from '../../shared/rules';
import { api } from '../api';
import type { CommunityPost } from '../types';
import { Empty } from '../components';
import { Avatar } from './Profile';
import { date } from './Library';

type Props = {
  notify: (message: string) => void;
};

export default function Community({ notify }: Props) {
  const [posts, setPosts] = useState<CommunityPost[]>([]),
    [body, setBody] = useState(''),
    [mood, setMood] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api<{ posts: CommunityPost[] }>('/community/posts');
      setPosts(result.posts);
    } catch (error) {
      notify(error instanceof Error ? error.message : '게시판을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api('/community/posts', { body, mood });
      setBody('');
      setMood('');
      await load();
      notify('게시글을 띄웠어요.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '게시글을 올리지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function like(post: CommunityPost) {
    const previous = posts;
    setPosts(
      posts.map((item) =>
        item.id === post.id
          ? { ...item, liked: !item.liked, likes: item.likes + (item.liked ? -1 : 1) }
          : item,
      ),
    );
    try {
      await api(`/community/posts/${post.id}/like`, {});
    } catch (error) {
      setPosts(previous);
      notify(error instanceof Error ? error.message : '좋아요를 저장하지 못했어요.');
    }
  }

  return (
    <>
      <div className="page-title">
        <span className="eyebrow">LISTENERS BOARD</span>
        <h1>커뮤니티</h1>
        <p>노래를 기다리는 동안 남기는 작은 이야기.</p>
      </div>
      <form className="community-composer" onSubmit={submit}>
        <div className="field-label">
          <label htmlFor="community-body">게시글 쓰기</label>
          <span>
            {Array.from(body).length} / {COMMUNITY_POST_LIMIT}
          </span>
        </div>
        <textarea
          id="community-body"
          placeholder="오늘 듣고 싶은 분위기, 방금 받은 노래의 여운, 추천받고 싶은 장르를 적어보세요."
          value={body}
          rows={3}
          onChange={(event) =>
            setBody(Array.from(event.target.value).slice(0, COMMUNITY_POST_LIMIT).join(''))
          }
        />
        <div className="community-actions">
          <select aria-label="게시글 무드" value={mood} onChange={(e) => setMood(e.target.value)}>
            <option value="">무드 없음</option>
            {MOODS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="primary" disabled={busy || !body.trim()} type="submit">
            <Send size={17} />
            {busy ? '올리는 중...' : '게시하기'}
          </button>
        </div>
      </form>
      <div className="section-heading community-heading">
        <h2>
          <MessageSquareText size={18} />
          방금 올라온 이야기
        </h2>
        {loading && <LoaderCircle className="spin" size={18} />}
      </div>
      {!posts.length && !loading ? (
        <Empty title="아직 게시글이 없어요">처음으로 바다 위에 말을 띄워보세요.</Empty>
      ) : (
        <div className="community-list">
          {posts.map((post) => (
            <article className={post.mine ? 'community-post mine' : 'community-post'} key={post.id}>
              <div className="post-author">
                <Avatar avatar={post.listener.avatar} color={post.listener.color} />
                <div>
                  <strong>익명의 리스너</strong>
                  <span>
                    Lv. {post.listener.level} · {post.listener.title}
                  </span>
                </div>
                <time>{date(post.createdAt)}</time>
              </div>
              <p>{post.body}</p>
              <div className="post-foot">
                {post.mood && <span>#{post.mood}</span>}
                <button
                  className={post.liked ? 'post-like active' : 'post-like'}
                  aria-pressed={post.liked}
                  onClick={() => like(post)}
                >
                  <Heart size={16} fill={post.liked ? 'currentColor' : 'none'} />
                  {post.likes}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
