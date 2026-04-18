utils.jq(() => {
  const els = Array.from(document.getElementsByClassName('ds-memos'));

  function decorateMemoContent(content) {
    return (content || '').replace(/(^|[\s(>])#([^\s#.,!?;:，。！？；：]+)/g, (match, prefix, tag) => {
      return `${prefix}<span class="memo-tag" data-tag="${tag}">#${tag}</span>`;
    });
  }

  function sanitizeMemoVoteId(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/[^a-z0-9/_-]+/g, '-')
      .replace(/\//g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function memoVersionSlug(version) {
    if (version === '22+') return 'v22-plus';
    if (version === '22-') return 'v22-minus';
    return sanitizeMemoVoteId(version || 'memos') || 'memos';
  }

  function memoStableId(item, versionHandler, version) {
    const raw = versionHandler.buildVoteSource(item);
    const fallback = item.name || item.id || item.uid || item.createTime || item.createdTs;
    const source = sanitizeMemoVoteId(raw || fallback);
    const versionSlug = memoVersionSlug(version);
    return source ? `memo-vote-${versionSlug}-${source}` : '';
  }

  function buildMemoVote(item, versionHandler, version, api) {
    if (!api) return '';
    const id = memoStableId(item, versionHandler, version);
    if (!id) return '';
    return `<div class="tag-plugin ds-vote memo-vote" data-api="${api}" data-id="${id}" aria-label="给这条记忆碎片点赞">
              <div class="memo-vote-inner">
                <button class="vote-up" type="button" aria-label="点赞这条记忆碎片">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.7-4.1-9.2-8.2C.6 9.2 2.6 5 6.6 5c2 0 3.4 1 4.2 2.1C11.6 6 13 5 15 5c4 0 6 4.2 3.8 7.8C16.7 16.9 12 21 12 21Z"/></svg>
                  <span class="up">--</span>
                </button>
              </div>
            </div>`;
  }

  function getVoteService() {
    if (typeof ctx !== 'undefined') {
      return ctx.services?.vote;
    }
    return null;
  }

  function getMemoVoteApi() {
    return window?.stellar?.memosVoteApi || window?.memosVoteApi || getVoteService()?.api || '';
  }

  function ensureMemoVoteReady() {
    if (window.StellarVote?.init) {
      window.StellarVote.init();
      return;
    }
    if (window.__memoVoteLoader) {
      window.__memoVoteLoader.then(() => window.StellarVote?.init?.());
      return;
    }
    const voteService = getVoteService();
    if (!voteService?.js) return;
    window.__memoVoteLoader = utils.js(voteService.js, { defer: true });
    window.__memoVoteLoader.then(() => window.StellarVote?.init?.());
  }

  els.forEach(el => {
    const api = el.dataset.api;
    if (!api) return;

    const default_avatar = el.getAttribute('avatar') || def.avatar;
    const limit = el.getAttribute('limit');
    const host = api.match(/https:\/\/(.*?)\/(.*)/i)[1];
    const voteApi = getMemoVoteApi();

    utils.request(el, api, async resp => {
      const data = await resp.json();
      let memos = versionHandlers.identify(data);
      if (memos.version === "feature" )return;

      const users = el.getAttribute('user')?.split(",") || [];
      const hide = el.getAttribute('hide')?.split(",") || [];

      await Promise.all(memos.data.slice(0, limit || memos.data.length).map(item =>
          createMemoCell(item, memos, users, hide, default_avatar, host).then(cell => $(el).append(cell))
      ));
      ensureMemoVoteReady();
    });

    async function createMemoCell(item, memos, users, hide, default_avatar, host) {
      const versionHandler = versionHandlers[memos.version] || versionHandlers["feature"];
      const renderedContent = marked.parse(decorateMemoContent(item.content || ''));
      return `<div class="timenode">
                      <div class="header">${!users.length && !hide.includes('user') ? await versionHandler.buildUser(item, memos, default_avatar) : ''}
                      <span>${versionHandler.buildDate(item).toLocaleString()}</span></div>
                      <div class="body">${renderedContent}
                      <div class="tag-plugin image">${versionHandler.buildImages(item, host).join('')}</div>
                      ${buildMemoVote(item, versionHandler, memos.version, voteApi)}
                      </div></div>`;
    }

    // Memos版本管理
    const versionHandlers = {
      "22-": {
        buildUser: async (item, memos, default_avatar) =>
            `<div class="user-info">${default_avatar ? `<img src="${default_avatar}" alt="${item.creatorName || 'memos'} 的头像">` : ''}<span>${item.creatorName}</span></div>`,
        buildDate: item => new Date(item.createdTs * 1000),
        buildVoteSource: item => item.id || item.uid || item.createdTs,
        buildImages: (item, host) => (item.resourceList || []).filter(res => res.type?.includes('image/')).map(res =>
            `<div class="image-bg"><img data-fancybox="memos" src="${res.externalLink || `https://${host}/o/r/${res.id}`}" alt="记忆碎片配图"></div>`
        )
      },
      "22+": {
        buildUser: async (item, memos, default_avatar) => {
          const creatorId = item?.creator.split('/')[1];
          let user = memos.users.find(user => user.id === parseInt(creatorId));
          if (!user) {
            if (!memos.requests[creatorId]) {
              memos.requests[creatorId] = fetch(`${memos.site}/api/v1/users/${creatorId}`)
                  .then(response => response.json())
                  .then(data => {
                    if (data.username) {
                      user = data;
                      memos.users.push(data);
                    } else {
                      user = null;
                    }
                  })
                  .finally(() => delete memos.requests[creatorId]);
            }
            await memos.requests[creatorId];
            user = memos.users.find(user => user.id === parseInt(creatorId));
          }
          const name = user ? user.nickname || user.username : 'memos';
          const avatarUrl = user?.avatarUrl ? `${memos.site}${user.avatarUrl}` : default_avatar || '';
          return `<div class="user-info">${avatarUrl ? `<img src="${avatarUrl}" alt="${name} 的头像">` : ''}<span>${name}</span></div>`;
        },
        buildDate: item => new Date(item.createTime),
        buildVoteSource: item => item.name || item.uid || item.id || item.createTime,
        buildImages: (item) => (item.resources || []).filter(res => res.type?.includes('image/')).map(res =>
            `<div class="image-bg"><img data-fancybox="memos" src="${res.externalLink || `https://${host}/o/r/${res.id}`}" alt="记忆碎片配图"></div>`
        )
      },
      "feature": {
        buildUser: async () => "memos",
        buildDate: () => new Date(),
        buildVoteSource: item => item?.name || item?.id || item?.createTime || item?.createdTs,
        buildImages: () => []
      },
      identify: (data) => {
        let memos = { version: "feature", users: [], site: api.split('/api/v1')[0], requests: {}, data: [] }
        if (Array.isArray(data)) {
          memos.version = "22-";
          memos.data = data;
        } else if (data.memos) {
          memos.version = "22+";
          memos.data = data.memos;
        } else {
          memos.version = "feature";
        }
        return memos
      }
    };
  });
});
