'use strict';
(() => {
  const q = selector => document.querySelector(selector);
  const cards = [...document.querySelectorAll('#track-list [data-track]')];
  const tracks = new Map(cards.map(card => [card.dataset.track, {
    card,
    title: card.querySelector('h3').textContent,
    audio: card.querySelector('.download').getAttribute('href'),
    cover: card.querySelector('.cover img'),
    play: card.querySelector('[data-play]'),
    add: card.querySelector('[data-add]')
  }]));
  const assetReady = img => img.classList.toggle('ready', img.complete && img.naturalWidth > 0);
  for (const track of tracks.values()) {
    track.cover.addEventListener('load', () => assetReady(track.cover));
    track.cover.addEventListener('error', () => assetReady(track.cover));
    assetReady(track.cover);
    track.play.hidden = track.add.hidden = false;
  }

  const nav = q('.library-nav');
  const modes = [...nav.querySelectorAll('[data-view]')];
  const picker = q('#theme-picker');
  const themes = [...picker.querySelectorAll('[data-theme]')];
  let currentTheme = null;
  function display(view, key) {
    const themed = view === 'themes';
    if (themed && key) currentTheme = key;
    picker.hidden = !themed;
    for (const button of modes) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    for (const button of themes) button.setAttribute('aria-pressed', String(themed && button.dataset.theme === currentTheme));
    const active = themed ? currentTheme : null;
    let count = 0;
    for (const card of cards) {
      card.hidden = Boolean(active && !card.dataset.themes.split(' ').includes(active));
      if (!card.hidden) count++;
    }
    const selected = active && themes.find(button => button.dataset.theme === active);
    q('#results-status').textContent = selected
      ? selected.firstChild.textContent.trim() + '：' + count + '曲を表示'
      : themed ? 'テーマを選ぶと曲を絞り込めます。現在は全' + count + '曲を表示。' : '全' + count + '曲を表示';
  }
  modes.forEach(button => button.addEventListener('click', () => display(button.dataset.view)));
  themes.forEach(button => button.addEventListener('click', () => display('themes', button.dataset.theme)));
  nav.hidden = false;
  display('all');

  const player = q('#player');
  const audio = q('#audio');
  const playerImage = q('#player-image');
  const feedback = q('#player-feedback');
  const playerMode = q('#player-mode');
  const items = q('#my-items');
  const start = q('#start-list');
  const listMessage = q('#my-message');
  const key = 'imajo-songs:my-list:v1';
  let playlist = [];
  let storageUnavailable = false;
  let current = null;
  let mode = 'single';
  let generation = 0;
  // If the playing song is removed, preserve the position between list items.
  let gap = null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) playlist = [...new Set(saved.map(String).filter(id => tracks.has(id)))];
  } catch {
    storageUnavailable = true;
  }
  function save() {
    try {
      window.localStorage.setItem(key, JSON.stringify(playlist));
      storageUnavailable = false;
    } catch {
      storageUnavailable = true;
    }
  }
  function say(message) {
    const region = q('#live-update');
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = message; });
  }
  function setFeedback(text = '') {
    feedback.hidden = !text;
    feedback.textContent = text;
  }
  function updatePlayerMode() {
    if (mode !== 'list') {
      playerMode.textContent = '1曲だけ再生';
      return;
    }
    const index = playlist.indexOf(current);
    playerMode.textContent = index >= 0 ? 'マイリスト再生 · ' + (index + 1) + ' / ' + playlist.length : 'マイリスト再生';
  }
  playerImage.addEventListener('load', () => { playerImage.hidden = !playerImage.naturalWidth; });
  playerImage.addEventListener('error', () => { playerImage.hidden = true; });
  function play(id, nextMode) {
    const track = tracks.get(id);
    if (!track) return;
    const token = ++generation;
    if (current) tracks.get(current).card.removeAttribute('data-current');
    current = id;
    mode = nextMode;
    gap = null;
    track.card.setAttribute('data-current', '');
    q('#player-title').textContent = track.title;
    playerImage.hidden = true;
    const coverPath = track.cover.getAttribute('src');
    if (playerImage.getAttribute('src') === coverPath && playerImage.complete) {
      playerImage.hidden = !playerImage.naturalWidth;
    } else {
      playerImage.src = coverPath;
    }
    updatePlayerMode();
    setFeedback();
    player.hidden = false;
    audio.src = track.audio;
    audio.setAttribute('aria-label', track.title + 'の再生プレーヤー');
    // Invoked directly inside the click so gesture-gated playback works.
    const result = audio.play();
    if (result) result.catch(error => {
      if (generation !== token || error.name === 'AbortError' || audio.error) return;
      setFeedback('再生が始まらない場合は、プレーヤーの再生ボタンを押してください。');
    });
    say(track.title + ' · ' + playerMode.textContent);
  }
  audio.addEventListener('playing', () => setFeedback());
  audio.addEventListener('error', () => {
    if (current && audio.error) setFeedback('音源を読み込めませんでした。通信状況を確認し、曲の再生ボタンをもう一度押してください。');
  });
  audio.addEventListener('ended', () => {
    if (mode !== 'list' || !audio.ended) return;
    const index = playlist.indexOf(current);
    const next = playlist[index >= 0 ? index + 1 : (gap ?? playlist.length)];
    if (next) play(next, 'list');
    else setFeedback('マイリストの最後まで再生しました。');
  });

  function makeButton(name, label, control, disabled, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.setAttribute('aria-label', label);
    button.dataset.control = control;
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }
  function restoreFocus(id, control) {
    const row = id && [...items.children].find(node => node.dataset.id === id);
    const preferred = row?.querySelector('[data-control="' + control + '"]:not(:disabled)');
    const fallback = row?.querySelector('button:not(:disabled)') ?? (start.disabled ? q('.top a') : start);
    (preferred ?? fallback).focus();
  }
  function remove(id, fromList) {
    const index = playlist.indexOf(id);
    if (index < 0) return;
    if (mode === 'list' && id === current) gap = index;
    else if (gap !== null && index < gap) gap--;
    playlist.splice(index, 1);
    save();
    renderList();
    if (fromList) restoreFocus(playlist[Math.min(index, playlist.length - 1)], 'remove');
    say(tracks.get(id).title + 'をマイリストから削除しました');
  }
  function move(id, delta) {
    const before = playlist.indexOf(id);
    const after = before + delta;
    if (before < 0 || after < 0 || after >= playlist.length) return;
    [playlist[before], playlist[after]] = [playlist[after], playlist[before]];
    save();
    renderList();
    restoreFocus(id, delta < 0 ? 'up' : 'down');
    say(tracks.get(id).title + 'を' + (after + 1) + '曲目に移動しました');
  }
  function renderList() {
    const selected = new Set(playlist);
    for (const [id, track] of tracks) {
      const added = selected.has(id);
      track.add.textContent = added ? '✓ マイリスト' : '＋ マイリスト';
      track.add.setAttribute('aria-pressed', String(added));
      track.add.setAttribute('aria-label', track.title + 'のマイリスト登録');
    }
    items.replaceChildren(...playlist.map((id, index) => {
      const {title} = tracks.get(id);
      const row = document.createElement('li');
      row.dataset.id = id;
      const name = document.createElement('span');
      name.textContent = title;
      name.className = 'list-song';
      const buttons = document.createElement('div');
      buttons.className = 'list-buttons';
      buttons.append(
        makeButton('↑', title + 'を上に移動', 'up', index === 0, () => move(id, -1)),
        makeButton('↓', title + 'を下に移動', 'down', index === playlist.length - 1, () => move(id, 1)),
        makeButton('削除', title + 'をマイリストから削除', 'remove', false, () => remove(id, true))
      );
      row.append(name, buttons);
      return row;
    }));
    start.disabled = playlist.length === 0;
    q('#my-count').textContent = playlist.length + '曲';
    listMessage.textContent = storageUnavailable ? 'ブラウザーに保存できません。マイリストはページを閉じると消えます。'
      : playlist.length === 0 ? '曲一覧の「＋ マイリスト」から追加できます。' : '';
    if (current) updatePlayerMode();
  }
  for (const [id, track] of tracks) {
    track.play.addEventListener('click', () => play(id, 'single'));
    track.add.addEventListener('click', () => {
      if (playlist.includes(id)) return remove(id, false);
      playlist.push(id);
      if (current === id) gap = null;
      save();
      renderList();
      say(track.title + 'をマイリストに追加しました');
    });
  }
  start.addEventListener('click', () => { if (playlist.length) play(playlist[0], 'list'); });
  renderList();
  q('#my-list').hidden = false;
})();
