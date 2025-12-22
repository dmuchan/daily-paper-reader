// Docsify 配置与公共插件（评论区 + Zotero 元数据）
window.$docsify = {
  name: 'Daily Paper Reader',
  repo: '',
  // 文档内容与侧边栏都存放在 docs/ 下
  basePath: 'docs/', // 所有 Markdown 路由以 docs/ 为前缀
  loadSidebar: '_sidebar.md', // 在 basePath 下加载 _sidebar.md
  // 始终使用根目录的 _sidebar.md，避免每个子目录都要放一份
  alias: {
    '/.*/_sidebar.md': '/_sidebar.md',
  },
  subMaxLevel: 2,

  // --- 核心：注册自定义插件 ---
  plugins: [
    function (hook, vm) {
      // 确保 marked 开启 GFM 表格支持，并允许内联 HTML（用于聊天区 Markdown 渲染）
      if (window.marked && window.marked.setOptions) {
        const baseOptions =
          (window.marked.getDefaults && window.marked.getDefaults()) || {};
        window.marked.setOptions(
          Object.assign({}, baseOptions, {
            gfm: true,
            breaks: false,
            tables: true,
            // 允许 <sup> 等内联 HTML 直接渲染，而不是被转义
            sanitize: false,
            mangle: false,
            headerIds: false,
          }),
        );
      }

      // 1. 解析当前文章 ID (简单用文件名作为 ID)
      const getPaperId = () => {
        return vm.route.file.replace('.md', '');
      };

      const metaFallbacks = {
        citation_title: 'Daily Paper Reader Default Entry',
        citation_journal_title: 'Daily Paper Reader (ArXiv)',
        citation_pdf_url: 'https://daily-paper-reader.invalid/default.pdf',
        citation_publication_date: '2024-01-01',
        citation_date: '2024/01/01',
      };

      const defaultAuthors = ['Daily Paper Reader Team', 'Docsify Renderer'];

      // 公共工具：在指定元素上渲染公式
      const renderMathInEl = (el) => {
        if (!window.renderMathInElement || !el) return;
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        });
      };

      // 公共工具：简单表格 + 标记修正：
      // 1）移除协议标记 [ANS]/[THINK]
      // 2）移除表格行之间多余空行，避免把同一张表拆成两块
      const normalizeTables = (markdown) => {
        if (!markdown) return '';
        // 清理历史遗留的协议标记
        let text = markdown
          .replace(/\[ANS\]/g, '')
          .replace(/\[THINK\]/g, '');

        const lines = text.split('\n');
        const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
        const result = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const prev = result.length ? result[result.length - 1] : '';
          const next = i + 1 < lines.length ? lines[i + 1] : '';
          if (
            line.trim() === '' &&
            isTableLine(prev || '') &&
            isTableLine(next || '')
          ) {
            // 跳过表格行之间的空行
            continue;
          }
          result.push(line);
        }
        return result.join('\n');
      };

      const escapeHtml = (str) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };

      // 自定义表格渲染：检测 Markdown 表格块并手写生成 <table>，
      // 其他内容仍交给 marked 渲染。
      const renderMarkdownWithTables = (markdown) => {
        const text = normalizeTables(markdown || '');
        const lines = text.split('\n');
        const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
        const isAlignLine = (line) =>
          /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line);

        const parseRow = (line) => {
          const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
          return trimmed.split('|').map((cell) => cell.trim());
        };

        const inlineRender = (cellText) => {
          if (!cellText) return '';
          if (window.marked && window.marked.parseInline) {
            return window.marked.parseInline(cellText);
          }
          return escapeHtml(cellText);
        };

        const blocks = [];
        let i = 0;

        const flushParagraph = (paraLines) => {
          const paraText = paraLines.join('\n').trim();
          if (!paraText) return;
          if (window.marked) {
            blocks.push(window.marked.parse(`\n${paraText}\n`));
          } else {
            blocks.push(`<p>${escapeHtml(paraText)}</p>`);
          }
        };

        while (i < lines.length) {
          const line = lines[i];

          // 检测表格块：当前行是表格行，下一行是对齐行
          if (
            isTableLine(line) &&
            i + 1 < lines.length &&
            isAlignLine(lines[i + 1])
          ) {
            const headerLine = lines[i];
            i += 2; // 跳过对齐行

            const bodyLines = [];
            while (i < lines.length && isTableLine(lines[i])) {
              bodyLines.push(lines[i]);
              i++;
            }

            const headers = parseRow(headerLine);
            const rows = bodyLines.map(parseRow);

            let html = '<table class="chat-table"><thead><tr>';
            headers.forEach((h) => {
              html += `<th>${inlineRender(h)}</th>`;
            });
            html += '</tr></thead><tbody>';
            rows.forEach((row) => {
              html += '<tr>';
              row.forEach((cell) => {
                html += `<td>${inlineRender(cell)}</td>`;
              });
              html += '</tr>';
            });
            html += '</tbody></table>';

            blocks.push(html);
          } else {
            // 非表格块：收集到下一个表格或结尾
            const paraLines = [];
            while (
              i < lines.length &&
              !(
                isTableLine(lines[i]) &&
                i + 1 < lines.length &&
                isAlignLine(lines[i + 1])
              )
            ) {
              paraLines.push(lines[i]);
              i++;
            }
            flushParagraph(paraLines);
          }
        }

        return blocks.join('');
      };

      const updateMetaTag = (name, content, options = {}) => {
        const old = document.querySelector(`meta[name="${name}"]`);
        if (old) old.remove();
        const useFallback = options.useFallback !== false;
        const value = content || (useFallback ? metaFallbacks[name] : '');
        if (!value) return;
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = value;
        document.head.appendChild(meta);
      };

      // 3. 侧边栏按“日期”折叠的辅助函数
      const setupCollapsibleSidebarByDay = () => {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;

        const STORAGE_KEY = 'dpr_sidebar_day_state_v1';
        let state = {};
        try {
          const raw = window.localStorage
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
          if (raw) {
            state = JSON.parse(raw) || {};
          }
        } catch {
          state = {};
        }
        // 先扫描一遍，找出所有日期和最新一天
        const items = nav.querySelectorAll('li');
        const dayItems = [];
        let latestDay = '';

        items.forEach((li) => {
          if (li.dataset.dayToggleApplied === '1') return;

          const childUl = li.querySelector(':scope > ul');
          const directLink = li.querySelector(':scope > a');
          if (!childUl || directLink) return;

          // 取第一个文本节点作为标签文本
          const first = li.firstChild;
          if (!first || first.nodeType !== Node.TEXT_NODE) return;
          const rawText = (first.textContent || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rawText)) return;

          dayItems.push({ li, text: rawText, first });
          if (!latestDay || rawText > latestDay) {
            latestDay = rawText;
          }
        });

        if (!dayItems.length) return;

        // 判断是否出现了“更新后的新一天”
        const prevLatest =
          typeof state.__latestDay === 'string' ? state.__latestDay : null;
        const isNewDay =
          latestDay &&
          (!prevLatest || (typeof prevLatest === 'string' && latestDay > prevLatest));

        // 如果出现了新的一天：清空历史状态，只保留最新一天的信息
        if (isNewDay) {
          state = { __latestDay: latestDay };
        } else if (!prevLatest && latestDay) {
          // 第一次使用，没有历史记录但也不算“新一天触发重置”的场景：记录当前最新日期
          state.__latestDay = latestDay;
        }

        const hasAnyState =
          !isNewDay && Object.keys(state).some((k) => k !== '__latestDay');

        const ensureStateSaved = () => {
          try {
            if (window.localStorage) {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            }
          } catch {
            // ignore
          }
        };

        // 第二遍：真正安装折叠行为
        dayItems.forEach(({ li, text: rawText, first }) => {
          if (li.dataset.dayToggleApplied === '1') return;

          // 创建可点击的容器（包含日期文字和小箭头）
          const wrapper = document.createElement('div');
          wrapper.className = 'sidebar-day-toggle';

          const labelSpan = document.createElement('span');
          labelSpan.className = 'sidebar-day-toggle-label';
          labelSpan.textContent = rawText;

          const arrowSpan = document.createElement('span');
          arrowSpan.className = 'sidebar-day-toggle-arrow';
          arrowSpan.textContent = '▾';

          wrapper.appendChild(labelSpan);
          wrapper.appendChild(arrowSpan);

          // 用 wrapper 替换原始文本节点
          li.replaceChild(wrapper, first);

          // 决定默认展开 / 收起：
          // - 如果本次是“出现了新的一天”：清空历史，只展开最新一天；
          // - 否则若已有用户偏好（state），按偏好来；
          // - 否则（首次使用且没有历史）：仅“最新一天”展开，其余收起。
          let collapsed;
          if (isNewDay) {
            collapsed = rawText === latestDay ? false : true;
          } else if (hasAnyState) {
            const saved = state[rawText];
            if (saved === 'open') {
              collapsed = false;
            } else if (saved === 'closed') {
              collapsed = true;
            } else {
              // 新出现的日期：默认跟最新一天策略走
              collapsed = rawText === latestDay ? false : true;
            }
          } else {
            collapsed = rawText === latestDay ? false : true;
          }

          if (collapsed) {
            li.classList.add('sidebar-day-collapsed');
            arrowSpan.textContent = '▸';
          } else {
            li.classList.remove('sidebar-day-collapsed');
            arrowSpan.textContent = '▾';
          }

          wrapper.addEventListener('click', () => {
            const collapsed = li.classList.toggle('sidebar-day-collapsed');
            arrowSpan.textContent = collapsed ? '▸' : '▾';
            state[rawText] = collapsed ? 'closed' : 'open';
            state.__latestDay = latestDay;
            ensureStateSaved();
          });

          li.dataset.dayToggleApplied = '1';
        });
      };

      // 4. 论文“已阅读”状态管理（存储在 localStorage）
      const READ_STORAGE_KEY = 'dpr_read_papers_v1';

      const loadReadState = () => {
        try {
          if (!window.localStorage) return {};
          const raw = window.localStorage.getItem(READ_STORAGE_KEY);
          if (!raw) return {};
          const obj = JSON.parse(raw);
          return obj && typeof obj === 'object' ? obj : {};
        } catch {
          return {};
        }
      };

      const saveReadState = (state) => {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(state));
        } catch {
          // ignore
        }
      };

      const markSidebarReadState = (currentPaperId) => {
        const nav = document.querySelector('.sidebar-nav');
        if (!nav) return;

        const state = loadReadState();
        if (currentPaperId) {
          state[currentPaperId] = true;
          saveReadState(state);
        }

        const links = nav.querySelectorAll('a[href*="#/"]');
        links.forEach((a) => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/#\/(.+)$/);
          if (!m) return;
          const paperIdFromHref = m[1].replace(/\/$/, '');
          const li = a.closest('li');
          if (!li) return;
          if (state[paperIdFromHref]) {
            li.classList.add('sidebar-paper-read');
          } else {
            li.classList.remove('sidebar-paper-read');
          }
        });
      };

      // 5. 渲染评论区的 HTML 结构
      const renderChatUI = () => {
        return `
          <div id="paper-chat-container">
            <div class="chat-header">💬 公共研讨区 (Public Discussion)</div>
            <div id="chat-history">
                <div style="text-align:center; color:#999">正在加载讨论记录...</div>
            </div>
            <div class="input-area">
              <textarea id="user-input" rows="3" placeholder="针对这篇论文提问，所有人可见..."></textarea>
              <button id="send-btn">发送</button>
            </div>
          </div>
        `;
      };

      // 6. 获取历史记录 (API)
      const loadHistory = async (paperId) => {
        try {
          const res = await fetch(
            `${window.API_BASE_URL}/api/history?paper_id=${encodeURIComponent(
              paperId,
            )}`,
          );
          const data = await res.json();

          const historyDiv = document.getElementById('chat-history');
          if (!data || !data.length) {
            historyDiv.innerHTML =
              '<div style="text-align:center; color:#999">暂无讨论，快来抢沙发！</div>';
            return;
          }

          historyDiv.innerHTML = '';
          data.forEach((msg) => {
            const item = document.createElement('div');
            item.className = 'msg-item';

            const header = document.createElement('div');
            const roleSpan = document.createElement('span');
            const isThinking = msg.role === 'thinking';
            const isAi = msg.role === 'ai' || isThinking;
            roleSpan.className = 'msg-role ' + (isAi ? 'ai' : 'user');
            roleSpan.textContent = isThinking
              ? '🧠 AI 思考过程'
              : msg.role === 'ai'
                ? '🤖 AI 助手'
                : '👤 学术路人';
            const timeSpan = document.createElement('span');
            timeSpan.className = 'msg-time';
            timeSpan.textContent = msg.time || '';
            header.appendChild(roleSpan);
            header.appendChild(timeSpan);

            if (!isThinking) {
              const contentDiv = document.createElement('div');
              contentDiv.className = 'msg-content';
              const markdown = msg.content || '';
              contentDiv.innerHTML = renderMarkdownWithTables(markdown);
              renderMathInEl(contentDiv);

              item.appendChild(header);
              item.appendChild(contentDiv);
              historyDiv.appendChild(item);
              return;
            }

            // 思考消息：渲染为可折叠的历史思考区域
            const thinkingContainer = document.createElement('div');
            thinkingContainer.className = 'thinking-history-container';

            const thinkingHeader = document.createElement('div');
            thinkingHeader.className = 'thinking-history-header';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = '思考过程';
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'thinking-history-toggle';
            toggleBtn.textContent = '展开';
            thinkingHeader.appendChild(titleSpan);
            thinkingHeader.appendChild(toggleBtn);

            const thinkingContent = document.createElement('div');
            thinkingContent.className =
              'msg-content thinking-history-content thinking-collapsed';
            const markdown = msg.content || '';
            thinkingContent.innerHTML = renderMarkdownWithTables(markdown);
            renderMathInEl(thinkingContent);

            thinkingContainer.appendChild(thinkingHeader);
            thinkingContainer.appendChild(thinkingContent);

            // 默认折叠，点击按钮展开/折叠
            toggleBtn.addEventListener('click', () => {
              const collapsed = thinkingContent.classList.toggle(
                'thinking-collapsed',
              );
              toggleBtn.textContent = collapsed ? '展开' : '折叠';
            });

            item.appendChild(header);
            item.appendChild(thinkingContainer);
            historyDiv.appendChild(item);
          });

          historyDiv.scrollTop = historyDiv.scrollHeight;
        } catch (e) {
          console.error('加载失败', e);
        }
      };

      // 7. 发送消息 (API)
      const sendMessage = async () => {
        const input = document.getElementById('user-input');
        const btn = document.getElementById('send-btn');
        const question = input.value.trim();
        const paperId = getPaperId();

        const paperContent =
          (document.querySelector('.markdown-section') || {}).innerText || '';

        if (!question) return;

        input.disabled = true;
        btn.disabled = true;
        btn.innerText = '思考中...';

        const historyDiv = document.getElementById('chat-history');
        historyDiv.innerHTML += `
            <div class="msg-item">
                <div><span class="msg-role user">👤 你</span></div>
                <div class="msg-content">${question}</div>
            </div>
        `;
        historyDiv.scrollTop = historyDiv.scrollHeight;

        const aiItem = document.createElement('div');
        aiItem.className = 'msg-item';
        aiItem.innerHTML = `
            <div>
              <span class="msg-role ai">🤖 AI 助手</span>
            </div>
            <div class="thinking-container" style="margin-top:8px; border-left:3px solid #ddd; padding-left:8px; font-size:0.85rem; color:#666; display:none;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span>思考过程</span>
                <button class="thinking-toggle" style="margin-left:8px; font-size:0.75rem; padding:2px 6px;">折叠</button>
              </div>
              <div class="thinking-content" style="white-space:pre-wrap; margin-top:4px;"></div>
            </div>
            <div class="msg-content"></div>
        `;
        historyDiv.appendChild(aiItem);

        const thinkingContainer = aiItem.querySelector('.thinking-container');
        const thinkingContent = aiItem.querySelector('.thinking-content');
        const toggleBtn = aiItem.querySelector('.thinking-toggle');
        const aiAnswerDiv = aiItem.querySelector('.msg-content');

        let thinkingBuffer = '';
        let answerBuffer = '';
        let thinkingCollapsed = false;
        let hasShownAnswer = false;
        let renderTimer = null;
        let streamBuffer = '';

        const applyThinkingCollapsedView = () => {
          if (!thinkingBuffer) return;
          const source = normalizeTables(thinkingBuffer);
          const maxLines = 3;
          let toRender = source;

          if (thinkingCollapsed) {
            const lines = source.split('\n');
            if (lines.length > maxLines) {
              toRender =
                lines.slice(0, maxLines).join('\n') +
                '\n...（已折叠，点击展开查看更多思考过程）';
            }
          }

          thinkingContent.innerHTML = renderMarkdownWithTables(toRender);
          renderMathInEl(thinkingContent);
        };

        const scheduleRender = () => {
          if (renderTimer) return;
          renderTimer = requestAnimationFrame(() => {
            renderTimer = null;
            if (thinkingBuffer) {
              thinkingContainer.style.display = 'block';
              applyThinkingCollapsedView();
            }

            if (answerBuffer) {
              hasShownAnswer = true;
              const cleaned = answerBuffer
                .replace(/\[THINK\][\s\S]*?\[\/THINK\]/g, '')
                .replace(/\[ANS\]/g, '')
                .trim();
              aiAnswerDiv.innerHTML =
                renderMarkdownWithTables(cleaned || '（空响应）');
              renderMathInEl(aiAnswerDiv);
            }
          });
        };

        toggleBtn.addEventListener('click', () => {
          thinkingCollapsed = !thinkingCollapsed;
          toggleBtn.textContent = thinkingCollapsed ? '展开' : '折叠';
          applyThinkingCollapsedView();
        });

        try {
          const resp = await fetch(
            `${window.API_BASE_URL}/api/chat_stream`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paper_id: paperId,
                question,
                paper_content: paperContent,
              }),
            },
          );

          if (!resp.ok || !resp.body) {
            aiAnswerDiv.textContent = '请求失败，请稍后重试。';
            return;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder('utf-8');

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            streamBuffer += decoder.decode(value, { stream: true });

            let boundary = streamBuffer.lastIndexOf('\n');
            if (boundary === -1) continue;

            const chunk = streamBuffer.slice(0, boundary);
            streamBuffer = streamBuffer.slice(boundary + 1);

            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              let msg;
              try {
                msg = JSON.parse(line);
              } catch {
                continue;
              }
              if (msg.type === 'thinking') {
                thinkingBuffer += msg.content || '';
                scheduleRender();
              } else if (msg.type === 'answer') {
                answerBuffer += msg.content || '';
                scheduleRender();
              } else if (msg.type === 'error') {
                answerBuffer += `\n[ERROR] ${msg.content || ''}`;
                scheduleRender();
              }
            }

            historyDiv.scrollTop = historyDiv.scrollHeight;
          }

          input.value = '';
        } catch (e) {
          alert('发送失败，请重试');
        } finally {
          input.disabled = false;
          btn.disabled = false;
          btn.innerText = '发送';
          input.focus();
        }
      };

      // --- Docsify 生命周期钩子 ---
      hook.doneEach(function () {
        // 当前路由对应的“论文 ID”（简单用文件名去掉 .md）
        const paperId = getPaperId();
        const routePath = vm.route && vm.route.path ? vm.route.path : '';
        const lowerId = (paperId || '').toLowerCase();

        // 首页（如 README.md 或根路径）不展示公共研讨区，只做数学渲染和 Zotero 元数据更新
        const isHomePage =
          !paperId ||
          lowerId === 'readme' ||
          routePath === '/' ||
          routePath === '';

        // A. 对正文区域进行一次全局公式渲染（支持 $...$ / $$...$$）
        const mainContent = document.querySelector('.markdown-section');
        if (mainContent) {
          renderMathInEl(mainContent);

          if (!isHomePage) {
            // B. 非首页时才将 Chat UI 追加到文章底部
            const div = document.createElement('div');
            div.innerHTML = renderChatUI();
            mainContent.appendChild(div);
          }
        }

        if (!isHomePage) {
          // C. 绑定事件（仅在存在评论区时绑定）
          const sendBtnEl = document.getElementById('send-btn');
          if (sendBtnEl) {
            sendBtnEl.addEventListener('click', sendMessage);
          }

          const inputEl = document.getElementById('user-input');
          if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendMessage();
              }
            });
          }

          // D. 初始加载数据（仅在页面加载时请求一次）
          if (paperId) {
            loadHistory(paperId);
          }
        }

        // ----------------------------------------------------
        // E. 侧边栏按日期折叠
        // ----------------------------------------------------
        setupCollapsibleSidebarByDay();

        // ----------------------------------------------------
        // F. 侧边栏已阅读论文状态高亮
        // ----------------------------------------------------
        if (!isHomePage && paperId) {
          markSidebarReadState(paperId);
        } else {
          // 首页也需要应用已有的“已读高亮”，但不新增记录
          markSidebarReadState(null);
        }

        // ----------------------------------------------------
        // G. Zotero 元数据注入逻辑 (带延时和唤醒)
        // ----------------------------------------------------
        setTimeout(() => {
          try {
            const titleEl = document.querySelector('.markdown-section h1');
            const title = titleEl ? titleEl.innerText : document.title;

            let pdfLinkEl = document.querySelector(
              'a[href*="arxiv.org/pdf"]',
            );
            if (!pdfLinkEl) {
              pdfLinkEl = document.querySelector('a[href$=".pdf"]');
            }

            let pdfUrl = '';
            if (pdfLinkEl) {
              pdfUrl = new URL(
                pdfLinkEl.href,
                window.location.href,
              ).href;
            }

            let date = '';
            const matchDate = vm.route.file.match(/(\d{4}-\d{2}-\d{2})/);
            if (matchDate) {
              date = matchDate[1];
            }
            const citationDate = date ? date.replace(/-/g, '/') : '';

            let authors = [];
            document
              .querySelectorAll('.markdown-section p')
              .forEach((p) => {
                if (p.innerText.includes('Authors:')) {
                  const text = p.innerText
                    .replace('Authors:', '')
                    .trim();
                  authors = text
                    .split(/,|，/)
                    .map((a) => a.trim());
                }
              });

            updateMetaTag('citation_title', title);
            updateMetaTag(
              'citation_journal_title',
              'Daily Paper Reader (ArXiv)',
            );
            updateMetaTag('citation_pdf_url', pdfUrl, {
              useFallback: false,
            });
            updateMetaTag('citation_publication_date', date);
            updateMetaTag('citation_date', citationDate);

            document
              .querySelectorAll('meta[name="citation_author"]')
              .forEach((el) => el.remove());
            const authorList =
              authors.length ? authors : defaultAuthors;
            authorList.forEach((author) => {
              const meta = document.createElement('meta');
              meta.name = 'citation_author';
              meta.content = author;
              document.head.appendChild(meta);
            });

            document.dispatchEvent(
              new Event('ZoteroItemUpdated', {
                bubbles: true,
                cancelable: true,
              }),
            );
          } catch (e) {
            console.error('Zotero meta update failed:', e);
          }
        }, 1); // 延迟执行，等待 DOM 渲染完毕
      });
    },
  ],
};
