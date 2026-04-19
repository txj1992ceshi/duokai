# Duokai 启动入口总说明

当前项目的启动入口已经整理为三层结构：

## 1. 根目录核心脚本

这些脚本负责真正执行启动逻辑，不建议直接双击使用：

- `start.sh`
- `start_windows.bat`
- `admin_start.sh`
- `admin_start_windows.bat`
- `frontend_install_and_start.sh`
- `frontend_install_and_start_windows.bat`
- `admin_install_and_start.sh`
- `admin_install_and_start_windows.bat`
- `install_windows.bat`

## 2. 推荐双击入口

统一使用：

- `/Users/jj/Desktop/duokai/启动入口/前台`
- `/Users/jj/Desktop/duokai/启动入口/后台`

### 前台

- `前台_日常启动_Mac.command`
- `前台_日常启动_Windows.bat`
- `前台_首次安装并启动_Mac.command`
- `前台_首次安装并启动_Windows.bat`

默认打开：
- Duokai Web 前端 `http://localhost:3001`

### 后台

- `后台_日常启动_Mac.command`
- `后台_日常启动_Windows.bat`
- `后台_首次安装并启动_Mac.command`
- `后台_首次安装并启动_Windows.bat`

默认打开：
- 管理后台 `http://localhost:3000`

## 3. 历史兼容入口

旧名称的入口文件已经统一归档到：

- `/Users/jj/Desktop/duokai/legacy-launchers`

这些文件仅用于兼容旧习惯，不再推荐使用。

## 端口约定

- Duokai Web 前端：`3001`
- 后台管理端：`3000`
- API：`3100`
- Runtime：`3101`
