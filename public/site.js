(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- 侧栏手风琴 ---------- */
  $$('.nav-group').forEach((group) => {
    const toggle = $('.nav-toggle', group);
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      const open = group.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- 移动端抽屉 ---------- */
  const sidebar = $('#sidebar');
  const menuBtn = $('[data-menu]');
  const scrim = $('[data-scrim]');

  function openDrawer() {
    if (!sidebar) return;
    sidebar.classList.add('is-open');
    if (scrim) scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
    const first = $('.nav-item', sidebar);
    if (first) first.focus();
  }
  function closeDrawer() {
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (scrim) scrim.hidden = true;
    document.body.style.overflow = '';
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.focus();
    }
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeDrawer(); else openDrawer();
    });
  }
  if (scrim) scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (sidebar && sidebar.classList.contains('is-open')) closeDrawer();
  });

  /* ---------- FrameSlider ---------- */
  $$('[data-slider]').forEach((frame) => {
    const track = $('.slider-track', frame);
    const slides = $$('.slide', frame);
    const prev = $('.slider-arrow.is-prev', frame);
    const next = $('.slider-arrow.is-next', frame);
    const dots = $$('.dot', frame);
    if (!track || slides.length === 0) return;
    let index = 0;

    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === slides.length - 1;
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }
    function go(delta) {
      const target = Math.max(0, Math.min(slides.length - 1, index + delta));
      if (target === index) return;
      index = target;
      render();
    }

    if (prev) prev.addEventListener('click', () => go(-1));
    if (next) next.addEventListener('click', () => go(1));
    dots.forEach((dot, i) => dot.addEventListener('click', () => { index = i; render(); }));

    frame.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    });

    const viewport = $('.slider-viewport', frame);
    if (viewport) {
      viewport.style.touchAction = 'pan-y';
      let startX = null;
      viewport.addEventListener('pointerdown', (event) => { startX = event.clientX; });
      viewport.addEventListener('pointerup', (event) => {
        if (startX === null) return;
        const delta = event.clientX - startX;
        startX = null;
        if (Math.abs(delta) < 40) return;
        go(delta < 0 ? 1 : -1);
      });
      viewport.addEventListener('pointercancel', () => { startX = null; });
    }

    render();
  });

  /* ---------- 玻璃高光跟随指针 ---------- */
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer) {
    $$('.hilight').forEach((el) => {
      el.addEventListener('pointermove', (event) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        el.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      });
    });
  }

  /* ---------- 灯箱 ---------- */
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', '图片预览');
  lightbox.innerHTML = '<button class="lightbox-close" type="button" aria-label="关闭预览">关闭 ×</button><img alt="">';
  document.body.appendChild(lightbox);
  const lbImg = $('img', lightbox);
  const lbClose = $('.lightbox-close', lightbox);
  let lastFocus = null;

  function openLightbox(src, alt) {
    lastFocus = document.activeElement;
    lbImg.src = src;
    lbImg.alt = alt || '';
    lightbox.hidden = false;
    document.body.classList.add('has-lightbox');
    lbClose.focus();
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.src = '';
    document.body.classList.remove('has-lightbox');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', (event) => {
    const zoom = event.target.closest('.zoom');
    if (!zoom) return;
    event.preventDefault();
    openLightbox(zoom.dataset.full, zoom.dataset.alt);
  });
  lbClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  /* ---------- 删除确认（自绘，不用 confirm） ---------- */
  const confirmBox = document.createElement('div');
  confirmBox.className = 'confirm';
  confirmBox.hidden = true;
  confirmBox.setAttribute('role', 'dialog');
  confirmBox.setAttribute('aria-modal', 'true');
  confirmBox.innerHTML = '<div class="confirm-box"><p class="confirm-text"></p><div class="confirm-actions"><button class="btn" type="button" data-no>取消</button><button class="btn" type="button" data-yes>确认删除</button></div></div>';
  document.body.appendChild(confirmBox);
  let pendingForm = null;
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const message = form.getAttribute('data-confirm');
    if (!message) return;
    event.preventDefault();
    pendingForm = form;
    $('.confirm-text', confirmBox).textContent = message;
    confirmBox.hidden = false;
    $('[data-yes]', confirmBox).focus();
  });
  $('[data-yes]', confirmBox).addEventListener('click', () => {
    confirmBox.hidden = true;
    if (pendingForm) { const form = pendingForm; pendingForm = null; form.submit(); }
  });
  $('[data-no]', confirmBox).addEventListener('click', () => {
    confirmBox.hidden = true;
    pendingForm = null;
  });

  /* ---------- toast ---------- */
  const toast = $('.toast[role="status"]');
  if (toast) setTimeout(() => { toast.hidden = true; }, 3200);

  /* ---------- 图片上传：前端压到长边 1600 ---------- */
  async function compress(file, maxEdge = 1600, quality = 0.82) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    if (bitmap.close) bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function uploadImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('只支持 JPG / PNG / WebP');
    const dataUrl = await compress(file);
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '上传失败');
    return payload.path;
  }

  const galleryInput = $('#gallery');
  const galleryList = $('#gallery-list');
  let gallery = [];
  if (galleryInput) {
    try { gallery = JSON.parse(galleryInput.value || '[]'); } catch { gallery = []; }
    renderGallery();
  }
  function syncGallery() { if (galleryInput) galleryInput.value = JSON.stringify(gallery); }
  function renderGallery() {
    if (!galleryList) return;
    galleryList.innerHTML = '';
    gallery.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = item.path;
      img.alt = '';
      const fields = document.createElement('div');
      const alt = document.createElement('input');
      alt.value = item.alt || '';
      alt.placeholder = '图片描述（alt，必填）';
      const cap = document.createElement('input');
      cap.value = item.caption || '';
      cap.placeholder = '图注（可选，≤20 字）';
      cap.style.marginTop = '6px';
      fields.append(alt, cap);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'linkbtn';
      remove.textContent = '移除';
      remove.addEventListener('click', () => { gallery.splice(index, 1); syncGallery(); renderGallery(); });
      alt.addEventListener('input', () => { gallery[index].alt = alt.value; syncGallery(); });
      cap.addEventListener('input', () => { gallery[index].caption = cap.value; syncGallery(); });
      row.append(img, fields, remove);
      galleryList.appendChild(row);
    });
  }

  $$('input[data-upload]').forEach((input) => {
    input.addEventListener('change', async () => {
      const mode = input.dataset.upload;
      const files = [...input.files];
      if (!files.length) return;
      input.disabled = true;
      const holder = input.parentElement;
      let error = $('.upload-error', holder);
      if (error) error.remove();
      let status = $('.upload-status', holder);
      if (!status) {
        status = document.createElement('p');
        status.className = 'upload-error upload-status';
        holder.appendChild(status);
      }
      status.textContent = '上传中…';
      try {
        if (mode === 'cover') {
          const path = await uploadImage(files[0]);
          const hidden = $(input.dataset.target);
          const preview = $(input.dataset.preview);
          if (hidden) hidden.value = path;
          if (preview) { preview.src = path; preview.hidden = false; }
        } else {
          for (const file of files) {
            const path = await uploadImage(file);
            gallery.push({ path, alt: '', caption: '' });
          }
          syncGallery();
          renderGallery();
        }
      } catch (err) {
        status.textContent = '上传失败：' + err.message;
      } finally {
        if (status && !status.textContent.startsWith('上传失败')) status.textContent = '';
        input.disabled = false;
        input.value = '';
      }
    });
  });

  /* ---------- 笔记 .md 上传 ---------- */
  const mdForm = $('[data-md-upload]');
  if (mdForm) {
    mdForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fileInput = $('input[type="file"]', mdForm);
      const errorLine = $('.upload-error', mdForm);
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { errorLine.textContent = '先选一个 .md 文件。'; return; }
      if (!/\.md$/i.test(file.name)) { errorLine.textContent = '只支持 .md 文件。'; return; }
      if (file.size > 1024 * 1024) { errorLine.textContent = '文件超过 1MB。'; return; }
      const button = $('button[type="submit"]', mdForm);
      if (button) button.disabled = true;
      errorLine.textContent = '上传中…';
      try {
        const content = await file.text();
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || '上传失败');
        window.location.reload();
      } catch (err) {
        errorLine.textContent = '上传失败：' + err.message;
        if (button) button.disabled = false;
      }
    });
  }
/* ---------- 音乐：单播放器 ---------- */
  const player = $('.player');
  if (player) {
    const audio = $('audio', player);
    const playerTitle = $('.player-title', player);
    const close = $('.player-close', player);
    const playButtons = $$('.song-play');

    const reset = () => {
      playButtons.forEach((button) => {
        button.classList.remove('is-playing');
        const icon = $('span', button);
        if (icon) icon.textContent = '▶';
      });
    };

    playButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const same = audio.src === button.dataset.src && !audio.paused;
        if (same) {
          audio.pause();
          return;
        }
        reset();
        audio.src = button.dataset.src;
        playerTitle.textContent = button.dataset.title;
        player.hidden = false;
        button.classList.add('is-playing');
        const icon = $('span', button);
        if (icon) icon.textContent = '❚❚';
        try {
          await audio.play();
        } catch (error) {
          playerTitle.textContent = `试听加载失败：${error.message}`;
          reset();
        }
      });
    });

    audio.addEventListener('ended', reset);
    audio.addEventListener('pause', () => {
      playButtons.forEach((button) => {
        if (audio.src === button.dataset.src) {
          button.classList.remove('is-playing');
          const icon = $('span', button);
          if (icon) icon.textContent = '▶';
        }
      });
    });
    if (close) close.addEventListener('click', () => { audio.pause(); player.hidden = true; });
  }

/* ---------- 爱好数据：Steam 同步 / 四平台刷新 ---------- */
  $$('form[data-api]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      const label = button ? button.textContent : '';
      let errorLine = $('.upload-error', form);
      if (!errorLine) {
        errorLine = document.createElement('p');
        errorLine.className = 'upload-error';
        form.appendChild(errorLine);
      }
      errorLine.textContent = '处理中…';
      if (button) { button.disabled = true; button.textContent = '处理中…'; }
      try {
        const response = await fetch(form.dataset.api, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) throw new Error(payload.error || `请求失败（${response.status}）`);
        window.location.reload();
      } catch (error) {
        errorLine.textContent = error.message;
        if (button) { button.disabled = false; button.textContent = label; }
      }
    });
  });

  /* ---------- 爱好数据：Epic 导出文件 ---------- */
  $$('form[data-epic-import]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('input[type="file"]', form);
      const errorLine = $('.upload-error', form);
      const button = $('button[type="submit"]', form);
      const file = input && input.files && input.files[0];
      if (!file) { errorLine.textContent = '先选一个 .json 或 .csv 文件。'; return; }
      if (!/\.(json|csv)$/i.test(file.name)) { errorLine.textContent = '只支持 .json / .csv。'; return; }
      if (file.size > 1024 * 1024) { errorLine.textContent = '文件超过 1MB。'; return; }
      errorLine.textContent = '导入中…';
      if (button) button.disabled = true;
      try {
        const content = await file.text();
        const response = await fetch('/api/games/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) throw new Error(payload.error || '导入失败');
        window.location.reload();
      } catch (error) {
        errorLine.textContent = error.message;
        if (button) button.disabled = false;
      }
    });
  });
})();