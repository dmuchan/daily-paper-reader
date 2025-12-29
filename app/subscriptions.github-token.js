// GitHub Token 订阅配置模块
// 负责：本地存储 Token、验证权限、更新按钮与信息区状态

window.SubscriptionsGithubToken = (function () {
  // 从本地存储加载 GitHub Token 数据
  const loadGithubToken = () => {
    try {
      const tokenData = localStorage.getItem('github_token_data');
      if (tokenData) {
        const data = JSON.parse(tokenData);
        return data;
      }
    } catch (e) {
      console.error('Failed to load GitHub token:', e);
    }
    return null;
  };

  // 保存 GitHub Token 数据到本地存储
  const saveGithubToken = (data) => {
    try {
      localStorage.setItem('github_token_data', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save GitHub token:', e);
    }
  };

  // 清除 GitHub Token 数据
  const clearGithubToken = () => {
    try {
      localStorage.removeItem('github_token_data');
    } catch (e) {
      console.error('Failed to clear GitHub token:', e);
    }
  };

  // 验证 GitHub Token 并检查权限
  const verifyGithubToken = async (token) => {
    try {
      // 1. 获取用户信息
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userRes.ok) {
        throw new Error('Token 无效或已过期');
      }

      const userData = await userRes.json();

      // 2. 检查权限 - 通过响应头的 X-OAuth-Scopes
      const scopes = userRes.headers.get('X-OAuth-Scopes');
      const scopeList = scopes ? scopes.split(',').map((s) => s.trim()) : [];

      const requiredScopes = ['repo', 'workflow'];
      const missingScopes = requiredScopes.filter(
        (scope) => !scopeList.includes(scope),
      );

      if (missingScopes.length > 0) {
        throw new Error(`缺少必要权限: ${missingScopes.join(', ')}`);
      }

      // 3. 获取当前页面的仓库信息（从 URL 推断）
      const currentUrl = window.location.href;
      let repoOwner = '';
      let repoName = '';

      // 格式: https://username.github.io/repo-name/
      const githubPagesMatch = currentUrl.match(
        /https?:\/\/([^.]+)\.github\.io\/([^\/]+)/,
      );
      if (githubPagesMatch) {
        repoOwner = githubPagesMatch[1];
        repoName = githubPagesMatch[2];
      } else {
        // 如果不是 GitHub Pages，默认使用当前用户
        repoOwner = userData.login;
      }

      // 4. 如果有仓库信息，验证 Token 是否有权限访问该仓库
      if (repoOwner && repoName) {
        const repoRes = await fetch(
          `https://api.github.com/repos/${repoOwner}/${repoName}`,
          {
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          },
        );

        if (!repoRes.ok) {
          throw new Error(
            `无法访问仓库 ${repoOwner}/${repoName}，请确认 Token 权限`,
          );
        }

        const repoData = await repoRes.json();

        if (!repoData.permissions || !repoData.permissions.push) {
          throw new Error(
            `没有仓库 ${repoOwner}/${repoName} 的写入权限`,
          );
        }
      }

      return {
        valid: true,
        login: userData.login,
        name: userData.name,
        repo:
          repoOwner && repoName
            ? `${repoOwner}/${repoName}`
            : '未检测到仓库',
        scopes: scopeList,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  };

  // 根据本地存储的 Token 推断仓库 owner/name
  const getRepoInfo = () => {
    const tokenData = loadGithubToken();
    if (!tokenData || !tokenData.token) return null;

    let owner = '';
    let repo = '';

    if (tokenData.repo && tokenData.repo.includes('/')) {
      const parts = tokenData.repo.split('/');
      owner = parts[0];
      repo = parts[1];
    } else {
      // 兜底：从当前 URL 推断
      const currentUrl = window.location.href;
      const githubPagesMatch = currentUrl.match(
        /https?:\/\/([^.]+)\.github\.io\/([^\/]+)/,
      );
      if (githubPagesMatch) {
        owner = githubPagesMatch[1];
        repo = githubPagesMatch[2];
      }
    }

    if (!owner || !repo) return null;
    return {
      owner,
      repo,
      token: tokenData.token,
    };
  };

  // 通用 GitHub API 调用封装
  const githubApiRequest = async (path, options = {}) => {
    const info = getRepoInfo();
    if (!info) {
      throw new Error('未配置有效的 GitHub Token 或仓库信息');
    }
    const url =
      path.startsWith('http') ?
        path :
        `https://api.github.com${path}`;
    const headers = Object.assign(
      {
        Authorization: `token ${info.token}`,
        Accept: 'application/vnd.github.v3+json',
      },
      options.headers || {},
    );
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `GitHub API 调用失败：${res.status} ${res.statusText} - ${text}`,
      );
    }
    return res.json();
  };

  // 读取 config.yaml 并解析为 JS 对象
  const loadConfig = async () => {
    const info = getRepoInfo();
    if (!info) {
      throw new Error('未配置有效的 GitHub Token 或仓库信息');
    }
    const res = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}/contents/config.yaml`,
      {
        headers: {
          Authorization: `token ${info.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );
    if (!res.ok) {
      throw new Error('无法读取 config.yaml，请确认文件已存在且 Token 有权限。');
    }
    const data = await res.json();
    const content = atob(data.content.replace(/\n/g, ''));
    const yaml = window.jsyaml || window.jsYaml || window.jsYAML;
    if (!yaml || typeof yaml.load !== 'function') {
      throw new Error('前端缺少 YAML 解析库（js-yaml），无法解析 config.yaml。');
    }
    const cfg = yaml.load(content) || {};
    return { config: cfg, sha: data.sha };
  };

  // 更新 config.yaml：接收一个 updater(config) 回调，返回新的 config 对象
  const updateConfig = async (updater, commitMessage = 'chore: update config.yaml from dashboard') => {
    const info = getRepoInfo();
    if (!info) {
      throw new Error('未配置有效的 GitHub Token 或仓库信息');
    }
    const { config: current, sha } = await loadConfig();
    const next = typeof updater === 'function' ? updater({ ...(current || {}) }) || current : current;
    const yaml = window.jsyaml || window.jsYaml || window.jsYAML;
    if (!yaml || typeof yaml.dump !== 'function') {
      throw new Error('前端缺少 YAML 序列化库（js-yaml），无法写入 config.yaml。');
    }
    const newContent = yaml.dump(next, { lineWidth: 120 });
    const body = {
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(newContent))),
      sha,
    };
    const res = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}/contents/config.yaml`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${info.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `写入 config.yaml 失败：${res.status} ${res.statusText} - ${text}`,
      );
    }
    return res.json();
  };

  // 使用给定的 config 对象保存到远端 config.yaml（用于“保存”按钮）
  const saveConfig = async (configObject, commitMessage = 'chore: save dashboard config from panel') => {
    const info = getRepoInfo();
    if (!info) {
      throw new Error('未配置有效的 GitHub Token 或仓库信息');
    }
    // 仅用于获取当前文件的 sha
    const { sha } = await loadConfig();
    const yaml = window.jsyaml || window.jsYaml || window.jsYAML;
    if (!yaml || typeof yaml.dump !== 'function') {
      throw new Error('前端缺少 YAML 序列化库（js-yaml），无法写入 config.yaml。');
    }
    const safeConfig = configObject || {};
    const newContent = yaml.dump(safeConfig, { lineWidth: 120 });
    const body = {
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(newContent))),
      sha,
    };
    const res = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}/contents/config.yaml`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${info.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `写入 config.yaml 失败：${res.status} ${res.statusText} - ${text}`,
      );
    }
    return res.json();
  };

  const init = (dom) => {
    const {
      githubAuthBtn,
      githubTokenSection,
      githubTokenInput,
      githubTokenToggleBtn,
      githubTokenVerifyBtn,
      githubTokenClearBtn,
      githubTokenMessage,
      githubTokenInfo,
      githubUserName,
      githubTokenExpiry,
      githubRepoName,
    } = dom;

    // 更新登录按钮状态
    const updateAuthButtonStatus = () => {
      const tokenData = loadGithubToken();
      if (tokenData && tokenData.token && tokenData.verified) {
        githubAuthBtn.textContent = '登录成功';
        githubAuthBtn.style.background = '#28a745';
        githubAuthBtn.style.color = 'white';
      } else {
        githubAuthBtn.textContent = '未登录';
        githubAuthBtn.style.background = '#6c757d';
        githubAuthBtn.style.color = 'white';
      }
    };

    // 显示 Token 信息
    const showTokenInfo = (userData) => {
      if (githubTokenInfo && githubUserName && githubRepoName) {
        githubUserName.textContent = userData.login || 'Unknown';
        githubRepoName.textContent = userData.repo || 'Unknown';

        if (userData.expiry) {
          githubTokenExpiry.textContent = new Date(
            userData.expiry,
          ).toLocaleDateString('zh-CN');
        } else {
          githubTokenExpiry.textContent = '永久';
        }

        githubTokenInfo.style.display = 'block';
      }
    };

    // 隐藏 Token 信息
    const hideTokenInfo = () => {
      if (githubTokenInfo) {
        githubTokenInfo.style.display = 'none';
      }
    };

    // 登录按钮点击事件 - 切换显示 Token 配置区域
    if (githubAuthBtn && !githubAuthBtn._bound) {
      githubAuthBtn._bound = true;
      githubAuthBtn.addEventListener('click', () => {
        if (githubTokenSection.style.display === 'none') {
          githubTokenSection.style.display = 'block';

          const tokenData = loadGithubToken();
          if (tokenData && tokenData.verified) {
            showTokenInfo(tokenData);
          }
        } else {
          githubTokenSection.style.display = 'none';
        }
      });
    }

    // Token 可见性切换
    if (githubTokenToggleBtn && !githubTokenToggleBtn._bound) {
      githubTokenToggleBtn._bound = true;
      githubTokenToggleBtn.addEventListener('click', () => {
        if (githubTokenInput.type === 'password') {
          githubTokenInput.type = 'text';
          githubTokenToggleBtn.textContent = '🙈';
        } else {
          githubTokenInput.type = 'password';
          githubTokenToggleBtn.textContent = '👁️';
        }
      });
    }

    // Token 验证并保存
    if (githubTokenVerifyBtn && !githubTokenVerifyBtn._bound) {
      githubTokenVerifyBtn._bound = true;
      githubTokenVerifyBtn.addEventListener('click', async () => {
        const token = githubTokenInput.value.trim();

        if (!token) {
          githubTokenMessage.innerHTML =
            '<span style="color:#dc3545;">❌ 请输入 GitHub Token</span>';
          return;
        }

        githubTokenVerifyBtn.disabled = true;
        githubTokenVerifyBtn.textContent = '验证中...';
        githubTokenMessage.innerHTML =
          '<span style="color:#666;">正在验证 Token...</span>';
        hideTokenInfo();

        const result = await verifyGithubToken(token);

        if (result.valid) {
          const tokenData = {
            token: token,
            verified: true,
            login: result.login,
            name: result.name,
            repo: result.repo,
            scopes: result.scopes,
            savedAt: new Date().toISOString(),
          };

          saveGithubToken(tokenData);

          githubTokenMessage.innerHTML = `
            <div style="color:#28a745;">
              <strong>✅ 验证成功！</strong><br>
              用户: ${result.login}<br>
              仓库: ${result.repo}<br>
              权限: ${result.scopes.join(', ')}
            </div>
          `;

          showTokenInfo(tokenData);
          updateAuthButtonStatus();
          githubTokenInput.value = '';
        } else {
          githubTokenMessage.innerHTML = `<span style="color:#dc3545;">❌ ${result.error}</span>`;
          hideTokenInfo();
        }

        githubTokenVerifyBtn.disabled = false;
        githubTokenVerifyBtn.textContent = '验证并保存';
      });
    }

    // Token 清除
    if (githubTokenClearBtn && !githubTokenClearBtn._bound) {
      githubTokenClearBtn._bound = true;
      githubTokenClearBtn.addEventListener('click', () => {
        if (confirm('确定要清除保存的 GitHub Token 吗？')) {
          clearGithubToken();
          githubTokenInput.value = '';
          githubTokenMessage.innerHTML =
            '<span style="color:#666;">Token 已清除</span>';
          hideTokenInfo();
          updateAuthButtonStatus();
        }
      });
    }

    updateAuthButtonStatus();
  };

  return {
    init,
    loadGithubToken,
    loadConfig,
    updateConfig,
    saveConfig,
  };
})();
