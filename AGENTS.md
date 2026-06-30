# AGENTS.md — Pits n' Giggles 工程说明

## 概述

**Pits n' Giggles** 是一个 F1 遥测数据套件，从 F1 游戏（F1 23/24/25）接收 UDP/TCP 广播，解析、分析并通过浏览器仪表盘和游戏内 HUD 叠加层展示。

- 版本：`meta/meta.py` 中定义（当前 4.2.0）
- Python 3.12–3.14，依赖管理使用 Poetry
- 作者：Ashwin Natarajan，MIT 许可

## 技术栈

| 层 | 技术 |
|---|---|
| 构建 | Poetry + PyInstaller（`scripts/png.spec`，onefile 模式） |
| 后端 | Quart（异步 Web）+ Socket.IO + uvicorn |
| HUD | PySide6（Qt）+ QML 叠加层 |
| IPC | ZeroMQ（pyzmq）：Pub/Sub、Req/Rep、Router/Dealer 三种模式 |
| 前端 | 原生 Vanilla JS/HTML/CSS，通过 Socket.IO 获取实时数据 |
| 序列化 | orjson + msgpack |
| 测试 | pytest + pytest-xdist（`-n auto --dist=loadgroup`） |

## 数据来源

1. **F1 游戏 UDP 广播** — 主数据源。游戏每帧广播 16 种数据包（运动、车辆状态、圈速、轮胎等）。监听端口在 `png_config.json` 中配置。
2. **F1 游戏 TCP 流** — 辅助数据源。
3. **OpenF1 API**（可选）— 外部 REST API，提供实时/历史 F1 比赛数据（天气、赛道状态等）。
4. **保存的遥测文件**（`.f1pcap`）— 录制的数据包回放，由 `dev_tools/telemetry_replayer` 使用。

## 架构

### 多进程模型

```
apps/launcher/     → Tkinter GUI，启动/监控所有子进程
apps/backend/      → 核心遥测服务器，UDP/TCP 接收 + 分析 + WebSocket/REST
apps/hud/          → Qt 叠加层窗口（始终置顶），显示游戏内数据
apps/broker/       → ZeroMQ Pub/Sub 代理，多客户端转发
apps/save_viewer/  → Quart Web 服务器，离线分析已保存的 session JSON
apps/frontend/     → 浏览器仪表盘（由 backend 的 WebSocket 推送）
apps/mcp_server/   → MCP 服务器（stdio + HTTP/SSE），暴露 7 种工具
apps/dev_tools/    → 遥测回放器和数据包捕获工具
apps/external/     → f1-save-viewer React 子模块
```

### 后端三层结构 (`apps/backend/`)

1. **`telemetry_layer/`** — 接收并解析 16 种 F1 数据包，帧率门控
2. **`state_mgmt_layer/`** — `SessionState` 聚合数据，超车/碰撞检测，轮胎磨损分析
3. **`intf_layer/`** — Quart Web 服务器 + Socket.IO，向客户端推送状态更新，暴露 REST API

### 数据流

```
F1 游戏 (UDP/TCP)
  → TelemetryManager (lib/telemetry_manager) 解析数据包
  → SessionState (state_mgmt_layer) 聚合分析
  → TelemetryWebServer (intf_layer) Socket.IO 广播
  → 浏览器仪表盘 (apps/frontend) + HUD 叠加层 (apps/hud)
```

## 开发命令

```bash
# 安装依赖
poetry install

# 运行全部测试（并行 + 串行自动分配）
poetry run pytest tests/

# 运行单个测试文件
poetry run pytest tests/tests_version.py

# 按名称匹配测试
poetry run pytest tests/ -k "TestWatchDogTimerAsync"

# 仅运行串行测试（IPC/网络/进程相关）
poetry run pytest tests/ -m serial

# 仅运行并行安全测试
poetry run pytest tests/ -m "not serial"

# OpenF1 实时 API 测试（需要网络，默认排除）
poetry run pytest tests/tests_openf1/tests_openf1_integration.py -m openf1 -v -n 0

# 单进程模式调试
poetry run pytest tests/ -n 0

# Lint
poetry run pylint --rcfile scripts/.pylintrc apps lib

# 覆盖率
poetry run python scripts/coverage_ut.py
poetry run python scripts/coverage_integration_tests.py

# 打包
poetry run python scripts/build.py
```

### 运行各应用

```bash
poetry run python -m apps.launcher          # 主启动器 GUI
poetry run python -m apps.backend           # 遥测服务器
poetry run python -m apps.hud               # HUD 叠加层
poetry run python -m apps.broker            # ZeroMQ 代理
poetry run python -m apps.save_viewer       # 离线 session 查看器
poetry run python -m apps.dev_tools.telemetry_replayer --file-name example.f1pcap
```

**注意**：`dev_tools` 没有 `__main__.py`，需通过模块路径直接运行。

## 项目结构关键文件

| 文件 | 作用 |
|---|---|
| `meta/meta.py` | 版本号唯一来源（`APP_VERSION`，`APP_NAME_SNAKE`） |
| `png_config.json` | 运行时配置（端口、捕获模式、HUD、隐私等），运行时由启动器生成 |
| `integration_test_cfg.json` | `png_config.json` 的 schema 参考（配置项最全） |
| `scripts/png.spec` | PyInstaller 构建规格，含已注册的子模块和 QML 资源 |
| `pyproject.toml` | Poetry 配置 + pytest 设置（`asyncio_mode=auto`） |
| `scripts/.pylintrc` | Pylint 配置：最长 120 字符行宽，禁用过多检查项 |

## 重要架构细节

### IPC 模式 (`lib/ipc/`)

三种 ZeroMQ 通信模式，`PngAppId` 枚举所有应用身份：

- **Pub/Sub** — `IpcPublisherAsync` 发布，`IpcSubscriberAsync/Sync` 订阅。启动器用 `IpcPubSubBroker` 扇出状态更新给所有子进程。
- **Req/Rep** — `IpcClientSync` 请求，`IpcServerSync/Async` 处理。用于同步控制命令。
- **Router/Dealer** — `IpcRouter`（服务端）+ `IpcDealerClient/Async`（客户端），异步多对一通信。

### 测试注意事项

- 测试总数约 841：~131 串行 / ~710 并行
- 串行测试（`@pytest.mark.serial`）使用真实 socket、端口或进程，不能并发
- 旧测试用 `unittest.TestCase` 风格（`self.assertEqual` 等），新测试建议用原生 pytest 风格（`assert` + pytest fixtures）
- 异步测试：`asyncio_mode = "auto"`，`async def test_*` 自动被收集，无需装饰器
- OpenF1 测试标记为 `openf1`，默认被排除

### Build 注意事项

- PyInstaller onefile 模式，启动器嵌入子模块分发器（`--module` 参数）
- 构建过程中会自动编译 `apps/external/f1-save-viewer` 的 React 应用
- 构建前需清理 `build/`、`dist/`、`*.spec` 目录

### 配置加载

配置由 `lib/config/` 加载 `png_config.json`，使用 Pydantic 验证。未提供文件时使用默认值。配置来自：
1. 显式指定的配置文件路径
2. 默认路径：`./png_config.json`

### 配置项变更

添加新配置项需同时更新：`lib/config/` 中的 Pydantic 模型、`png_config.json` 默认值（或生成逻辑）、子系统中的读取逻辑。参考 `.claude/commands/add-config-field.md`。
