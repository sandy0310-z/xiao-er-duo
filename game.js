/*
 * 鼠鼠闯关主游戏逻辑
 * 这是一个简单的迷宫游戏示例，包含以下特点：
 * - 使用 HTML5 Canvas 绘制网格、玩家（鼠标）和目标（奶酪）；
 * - 随机生成障碍物并逐级增加难度；
 * - 支持键盘方向键移动角色；
 * - 提供“提示路线”功能，利用 BFS 寻路算法显示最短路径，体现简单的 AI 概念；
 */

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  const hintBtn = document.getElementById('hintBtn');
  const autoBtn = document.getElementById('autoBtn');

  const CELL_COUNT = 10; // 每行/列的格子数
  const CELL_SIZE = canvas.width / CELL_COUNT;
  let level = 1;

  let grid = [];
  let player = { x: 0, y: 0 };
  let goal = { x: CELL_COUNT - 1, y: CELL_COUNT - 1 };
  let pathHint = [];
  let isAutoPlaying = false;
  let steps = 0;

  const stepsEl = document.getElementById('stepsCount');

  /*
   * 像素风精灵图定义：鼠标和奶酪
   * 通过二维数组定义不同颜色的像素块，使整体风格呈现复古像素感。
   */
  const mouseSprite = [
    [0, 1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 0],
    [1, 2, 1, 1, 1, 2, 1, 0],
    [1, 1, 3, 1, 1, 3, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 4, 4, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  const mouseColors = {
    1: '#268bd2', // 身体
    2: '#2aa198', // 耳朵
    3: '#073642', // 眼睛
    4: '#dc322f', // 鼻子
  };
  const cheeseSprite = [
    [2,2,2,2,2,2,2,2],
    [2,1,2,2,2,1,2,2],
    [2,2,2,1,2,2,2,2],
    [2,2,2,2,2,2,2,2],
    [2,2,2,2,1,2,2,2],
    [2,1,2,2,2,2,2,2],
    [2,2,2,2,2,2,1,2],
    [2,2,2,2,2,2,2,2],
  ];
  const cheeseColors = {
    1: '#fdf6e3', // 洞
    2: '#b58900', // 奶酪
  };

  /*
   * 音频设置
   * 使用 Web Audio API 创建背景音乐、行走音效和闯关音效。
   * 由于浏览器限制，必须在用户交互后才能播放声音。
   */
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  // 背景音乐：使用外部 MP3 文件替换原来的方波背景音
  // 加载并循环播放 Puzzle Game Loop 音频，调整音量以避免过大音量
  const bgMusic = new Audio('puzzle_background.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.4;
  // 标记背景音乐是否已开始播放，避免重复触发
  let bgStarted = false;

  // 恢复音频上下文（在用户交互时调用）
  function resumeAudio() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!bgStarted) {
      startBackgroundMusic();
    }
  }

  function startBackgroundMusic() {
    // 开始播放背景音乐。如果已经开始则直接返回
    if (bgStarted) return;
    // 重置播放位置
    bgMusic.currentTime = 0;
    // 尝试播放（可能因为用户未交互而失败）
    const playPromise = bgMusic.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // 捕获播放错误但不做处理，稍后由 resumeAudio 触发
      });
    }
    bgStarted = true;
  }

  function stopBackgroundMusic() {
    // 暂停背景音乐播放并重置
    if (bgStarted) {
      bgMusic.pause();
      // 重置播放位置，便于下一次播放从头开始
      bgMusic.currentTime = 0;
      bgStarted = false;
    }
  }

  function playFootstepSound() {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gainNode).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  }

  function playVictorySound() {
    stopBackgroundMusic();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'triangle';
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    osc.connect(gainNode).connect(audioCtx.destination);
    // 上升的音阶
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.5);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
    // 胜利音效结束后重新播放背景音乐
    osc.onended = () => {
      startBackgroundMusic();
    };
  }

  // 初始化/重置游戏
  function initGame() {
    // 创建初始空网格
    grid = new Array(CELL_COUNT).fill(0).map(() => new Array(CELL_COUNT).fill(0));
    // 放置玩家和目标
    player = { x: 0, y: 0 };
    goal = { x: CELL_COUNT - 1, y: CELL_COUNT - 1 };
    // 根据级别生成随机障碍物
    generateObstacles(level);
    pathHint = [];
    steps = 0;
    updateStepsDisplay();
    statusEl.textContent = `第 ${level} 关，加油！`;
    draw();
  }

  // 生成障碍物，数量随关卡提升
  function generateObstacles(level) {
    const obstacleCount = Math.min(level * 8, CELL_COUNT * CELL_COUNT / 3);
    let placed = 0;
    while (placed < obstacleCount) {
      const x = Math.floor(Math.random() * CELL_COUNT);
      const y = Math.floor(Math.random() * CELL_COUNT);
      // 不在起点或终点
      if ((x === 0 && y === 0) || (x === goal.x && y === goal.y)) continue;
      // 避免重复
      if (grid[y][x] === 1) continue;
      grid[y][x] = 1;
      placed++;
    }
    // 确保起点和终点可达；如果不可达则递归重新生成
    const reachable = bfs(player, goal);
    if (reachable.length === 0) {
      // 清除障碍重新生成
      grid = grid.map(row => row.map(() => 0));
      generateObstacles(level);
    }
  }

  // 绘制游戏
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 绘制网格
    for (let y = 0; y < CELL_COUNT; y++) {
      for (let x = 0; x < CELL_COUNT; x++) {
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;
        // 地板颜色
        ctx.fillStyle = (x + y) % 2 === 0 ? '#eee8d5' : '#fdf6e3';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        // 障碍物
        if (grid[y][x] === 1) {
          ctx.fillStyle = '#859900';
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        }
        // 提示路径
        if (pathHint.length > 0) {
          pathHint.forEach(pos => {
            if (pos.x === x && pos.y === y) {
              ctx.fillStyle = 'rgba(181, 137, 0, 0.4)';
              ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
            }
          });
        }
      }
    }
    // 绘制目标（奶酪）
    drawGoal();
    // 绘制玩家（鼠标）
    drawPlayer();
  }

  function drawPlayer() {
    // 使用像素精灵绘制鼠标
    const spriteSize = mouseSprite.length;
    const pixelSize = CELL_SIZE / spriteSize;
    for (let row = 0; row < spriteSize; row++) {
      for (let col = 0; col < spriteSize; col++) {
        const colorIndex = mouseSprite[row][col];
        const color = mouseColors[colorIndex];
        if (!color) continue;
        const x = player.x * CELL_SIZE + col * pixelSize;
        const y = player.y * CELL_SIZE + row * pixelSize;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }

  function drawGoal() {
    // 使用像素精灵绘制奶酪
    const spriteSize = cheeseSprite.length;
    const pixelSize = CELL_SIZE / spriteSize;
    for (let row = 0; row < spriteSize; row++) {
      for (let col = 0; col < spriteSize; col++) {
        const colorIndex = cheeseSprite[row][col];
        const color = cheeseColors[colorIndex];
        if (!color) continue;
        const x = goal.x * CELL_SIZE + col * pixelSize;
        const y = goal.y * CELL_SIZE + row * pixelSize;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }

  // 处理键盘事件
  window.addEventListener('keydown', e => {
    // 自动播放时禁止手动移动
    if (isAutoPlaying) return;
    const { x, y } = player;
    let nx = x;
    let ny = y;
    if (e.key === 'ArrowUp') {
      ny -= 1;
    } else if (e.key === 'ArrowDown') {
      ny += 1;
    } else if (e.key === 'ArrowLeft') {
      nx -= 1;
    } else if (e.key === 'ArrowRight') {
      nx += 1;
    } else {
      return;
    }
    movePlayer(nx, ny);
  });

  function movePlayer(nx, ny) {
    // 检查边界
    if (nx < 0 || ny < 0 || nx >= CELL_COUNT || ny >= CELL_COUNT) return;
    // 检查障碍物
    if (grid[ny][nx] === 1) return;
    // 如果移动到新位置则记录步数
    if (player.x !== nx || player.y !== ny) {
      player.x = nx;
      player.y = ny;
      steps++;
      updateStepsDisplay();
      // 播放行走音效
      resumeAudio();
      playFootstepSound();
    }
    // 移动后清除提示路径
    pathHint = [];
    // 检查胜利
    if (player.x === goal.x && player.y === goal.y) {
      // 由 checkVictory 处理
      checkVictory();
    }
    draw();
  }

  // 检查胜利并处理进入下一关
  function checkVictory() {
    if (player.x === goal.x && player.y === goal.y) {
      // 播放胜利音效
      resumeAudio();
      playVictorySound();
      // 计算最短路径长度（从起点到终点的步数）
      const shortestPath = bfs({ x: 0, y: 0 }, goal);
      const minSteps = shortestPath.length;
      let message;
      if (steps === minSteps) {
        message = `恭喜完成第 ${level} 关！你走了 ${steps} 步，达成最短路径！`;
      } else {
        message = `完成第 ${level} 关！你走了 ${steps} 步，最短路径是 ${minSteps} 步`;
      }
      statusEl.textContent = message;
      // 防止重复触发
      const currentLevel = level;
      setTimeout(() => {
        if (level === currentLevel) {
          level++;
          initGame();
        }
      }, 2000);
      return true;
    }
    return false;
  }

  function updateStepsDisplay() {
    stepsEl.textContent = `步数：${steps}`;
  }

  // BFS 寻找最短路径
  function bfs(start, end) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];
    const queue = [];
    const visited = new Set();
    const cameFrom = {};
    const key = (p) => `${p.x},${p.y}`;
    queue.push({ ...start });
    visited.add(key(start));
    while (queue.length > 0) {
      const current = queue.shift();
      // 到达终点
      if (current.x === end.x && current.y === end.y) {
        // 还原路径
        const path = [];
        let ckey = key(current);
        while (cameFrom[ckey]) {
          const [cx, cy] = ckey.split(',').map(Number);
          path.push({ x: cx, y: cy });
          ckey = cameFrom[ckey];
        }
        return path.reverse();
      }
      // 遍历四个方向
      for (const d of dirs) {
        const nx = current.x + d.x;
        const ny = current.y + d.y;
        const nkey = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= CELL_COUNT || ny >= CELL_COUNT) continue;
        if (grid[ny][nx] === 1) continue;
        if (visited.has(nkey)) continue;
        visited.add(nkey);
        cameFrom[nkey] = key(current);
        queue.push({ x: nx, y: ny });
      }
    }
    return [];
  }

  // 点击提示按钮
  hintBtn.addEventListener('click', () => {
    resumeAudio();
    const path = bfs(player, goal);
    if (path.length === 0) {
      statusEl.textContent = '没有可达路径！';
    } else {
      // 路径包括终点但不包括起点
      pathHint = path;
      statusEl.textContent = '提示：黄色高亮为推荐路径';
    }
    draw();
  });

  // 自动通关按钮：计算路径并自动移动
  autoBtn.addEventListener('click', () => {
    resumeAudio();
    if (isAutoPlaying) return;
    const path = bfs(player, goal);
    if (path.length === 0) {
      statusEl.textContent = '没有可达路径，无法自动通关！';
      return;
    }
    isAutoPlaying = true;
    statusEl.textContent = 'AI 自动通关中...';
    let i = 0;
    // 自动移动函数
    function step() {
      if (i >= path.length) {
        // 已经到达终点，胜利将由 movePlayer 处理
        // 到达最后一个位置，检查是否胜利
        isAutoPlaying = false;
        checkVictory();
        return;
      }
      const nextPos = path[i];
      i++;
      // 移动玩家到下一步，自动播放不清除提示
      // 增加步数
      player.x = nextPos.x;
      player.y = nextPos.y;
      steps++;
      updateStepsDisplay();
      draw();
      // 如果达到终点则结束并检查胜利
      if (player.x === goal.x && player.y === goal.y) {
        isAutoPlaying = false;
        checkVictory();
        return;
      }
      // 使用动画帧或超时来控制速度
      setTimeout(step, 200);
    }
    step();
  });

  // 重置游戏按钮
  resetBtn.addEventListener('click', () => {
    resumeAudio();
    initGame();
  });

  // 启动游戏
  initGame();
})();