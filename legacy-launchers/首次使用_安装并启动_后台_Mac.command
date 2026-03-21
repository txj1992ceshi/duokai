#!/bin/bash
echo "[DEPRECATED] 此旧入口已弃用，请改用 “启动入口” 目录中的标准入口。"
cd "$(dirname "$0")"
../admin_install_and_start.sh
