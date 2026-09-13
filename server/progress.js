// 수정 지점: 교환당 경험치, 레벨 간격, 도전과제 조건을 이곳에서 조정합니다.
export function progressFor(rows) {
  const completed = rows.filter((r) => r.status === 'matched');
  const genres = new Set(completed.map((r) => r.genre).filter(Boolean)).size;
  const letters = completed.filter((r) => r.message.trim()).length;
  const achievements = [
    {
      id: 'first',
      name: '첫 번째 파도',
      description: '첫 음악 교환',
      target: 1,
      value: completed.length,
      bonus: 25,
      icon: 'waves',
    },
    {
      id: 'five',
      name: '취향 수집가',
      description: '음악 5번 교환',
      target: 5,
      value: completed.length,
      bonus: 50,
      icon: 'disc',
    },
    {
      id: 'genres',
      name: '장르 여행자',
      description: '서로 다른 장르 3개 교환',
      target: 3,
      value: genres,
      bonus: 50,
      icon: 'compass',
    },
    {
      id: 'letters',
      name: '다정한 선곡',
      description: '한마디를 담아 3번 교환',
      target: 3,
      value: letters,
      bonus: 50,
      icon: 'heart',
    },
    {
      id: 'ten',
      name: '바다의 단골',
      description: '음악 10번 교환',
      target: 10,
      value: completed.length,
      bonus: 75,
      icon: 'trophy',
    },
  ].map((a) => ({ ...a, value: Math.min(a.value, a.target), unlocked: a.value >= a.target }));
  // 기록에서 계산하므로 새로고침·재요청·보틀 회수로 경험치가 중복 지급되지 않습니다.
  const xp =
    completed.length * 25 + achievements.filter((a) => a.unlocked).reduce((n, a) => n + a.bonus, 0);
  const level = Math.floor(xp / 100) + 1;
  return {
    xp,
    level,
    progress: xp % 100,
    nextLevelXp: 100,
    completed: completed.length,
    title:
      level >= 10
        ? '음악 항해사'
        : level >= 5
          ? '취향 탐험가'
          : level >= 2
            ? '파도 리스너'
            : '새싹 리스너',
    achievements,
  };
}
