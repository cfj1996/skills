#!/usr/bin/env python3
"""YApi CLI - 用于 AI 工作流的接口查询工具。

用法：
    python yapi.py search <关键字> [--limit N] [--method GET|POST] [--group 名称]
    python yapi.py query <接口ID>
    python yapi.py resolve <关键字> [--limit N]
    python yapi.py show <接口ID>
    python yapi.py gen-ts [--id <ID> | --query <关键字>] [--output <目录>]
    python yapi.py server list
    python yapi.py server set <projectId> <serverName>
    python yapi.py server get <projectId>
"""

import json
import sys
import argparse
import subprocess
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Any
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("需要安装 requests: pip install requests", file=sys.stderr)
    sys.exit(1)


# ============================================================================
# 配置
# ============================================================================

DEFAULT_CONFIG = {
    "base_url": "http://yapi.c3lt.cn",
    "login_path": "/api/user/login",
    "username": "chenfangjie@jubaozan.com",
    "password": "123456",
    "login_username_field": "email",
    "login_password_field": "password",
    "interface_search_path": "/api/project/search",
    "interface_detail_path": "/api/interface/get",
    "project_path": "/api/project/get",
    "request_timeout_ms": 10_000,
}


def load_config(config_path: str | None = None) -> dict:
    """加载配置文件或使用默认配置."""
    if config_path:
        file = Path(config_path)
        if file.exists():
            return json.loads(file.read_text(encoding="utf-8"))
    return DEFAULT_CONFIG.copy()


# ============================================================================
# HTTP 客户端
# ============================================================================

class YApiClientError(Exception):
    """YApi 客户端错误."""
    pass


class YApiClient:
    """YApi HTTP 客户端，使用 Cookie 认证."""

    def __init__(self, config: dict):
        self.config = config
        self._auth_cookie: str | None = None
        self._session = requests.Session()

    def login(self) -> str:
        """登录并获取认证 Cookie."""
        if self._auth_cookie:
            return self._auth_cookie

        url = f"{self.config['base_url']}{self.config['login_path']}"
        payload = {
            self.config["login_username_field"]: self.config["username"],
            self.config["login_password_field"]: self.config["password"],
        }

        response = self._session.post(
            url,
            json=payload,
            timeout=self.config["request_timeout_ms"] / 1000,
            headers={"Content-Type": "application/json"},
        )

        if not response.ok:
            raise YApiClientError(f"登录失败 HTTP {response.status_code}")

        set_cookie = response.headers.get("Set-Cookie")
        if not set_cookie:
            raise YApiClientError("登录未返回 Cookie")

        cookies = []
        for part in set_cookie.split(","):
            name_value = part.split(";")[0].strip()
            if name_value:
                cookies.append(name_value)

        if not cookies:
            raise YApiClientError("登录未返回 Cookie")

        self._auth_cookie = "; ".join(cookies)
        return self._auth_cookie

    def _request(self, path: str, params: dict | None = None) -> Any:
        """发送认证请求."""
        cookie = self.login()
        url = f"{self.config['base_url']}{path}"

        response = self._session.get(
            url,
            params=params,
            timeout=self.config["request_timeout_ms"] / 1000,
            headers={"Cookie": cookie},
        )

        if not response.ok:
            raise YApiClientError(f"请求失败 HTTP {response.status_code}")

        data = response.json()

        if "errcode" in data and data["errcode"] != 0:
            raise YApiClientError(data.get("errmsg", "请求失败"))

        return data.get("data")

    def search_interfaces(self, query: str, limit: int = 1000) -> list[dict]:
        """搜索接口."""
        data = self._request(self.config["interface_search_path"], {"q": query})
        return self._collect_records(data)[:limit]

    def get_interface_detail(self, interface_id: int) -> dict:
        """获取接口详情."""
        return self._request(self.config["interface_detail_path"], {"id": interface_id})

    def get_project(self, project_id: int) -> dict:
        """获取项目信息."""
        return self._request(self.config["project_path"], {"id": project_id})

    def _collect_records(self, data: Any, inherited_pid: int | None = None) -> list[dict]:
        """递归收集搜索结果."""
        if isinstance(data, list):
            results = []
            for item in data:
                results.extend(self._collect_records(item, inherited_pid))
            return results

        if not isinstance(data, dict):
            return []

        if "_id" in data and ("title" in data or "path" in data):
            pid = self._read_pid(data) or inherited_pid
            record = {"_id": data["_id"], **data}
            if pid:
                record["project_id"] = pid
            return [record]

        next_pid = inherited_pid or self._read_pid(data)
        results = []
        for value in data.values():
            results.extend(self._collect_records(value, next_pid))
        return results

    def _read_pid(self, data: dict) -> int | None:
        """提取项目 ID."""
        for key in ["project_id", "projectId", "pid"]:
            if key in data:
                val = data[key]
                if isinstance(val, int):
                    return val
                if isinstance(val, str) and val.strip():
                    try:
                        return int(val)
                    except ValueError:
                        pass

        if "project" in data and isinstance(data["project"], dict):
            pid = data["project"].get("_id")
            if isinstance(pid, int):
                return pid
            if isinstance(pid, str):
                try:
                    return int(pid)
                except ValueError:
                    pass

        return None


# ============================================================================
# 命令实现
# ============================================================================

@dataclass
class SearchResult:
    id: int
    project_id: int
    title: str
    method: str
    path: str
    group: str
    description: str
    score: float
    matched_fields: list[str]


@dataclass
class SearchResponse:
    success: bool = True
    query: str = ""
    total: int = 0
    items: list[SearchResult] = field(default_factory=list)


@dataclass
class QueryResponse:
    success: bool = True
    interface: dict = field(default_factory=dict)
    request: dict = field(default_factory=dict)
    response: dict = field(default_factory=dict)
    server_hint: str = ""  # 提示用户确认服务名
    raw: dict = field(default_factory=dict)


@dataclass
class ResolveResponse:
    status: str  # resolved / not_found / ambiguous
    query: str
    total: int = 0
    match: SearchResult | None = None
    detail: QueryResponse | None = None
    items: list[SearchResult] = field(default_factory=list)


def calc_score(query: str, item: dict) -> tuple[float, list[str]]:
    """计算匹配分数."""
    q = query.lower()
    matched = []
    score = 0.0

    title = item.get("title", "").lower()
    if q in title:
        matched.append("title")
        score += 0.4
        if title == q:
            score += 0.2

    path = item.get("path", "").lower()
    if q in path:
        matched.append("path")
        score += 0.3

    method = str(item.get("method", "")).upper()
    if q.upper() == method:
        matched.append("method")
        score += 0.1

    desc = (item.get("desc", "") or "").lower()
    if q in desc:
        matched.append("description")
        score += 0.1

    return score, matched


def cmd_search(client: YApiClient, query: str, limit: int = 10, method: str | None = None, group: str | None = None) -> SearchResponse:
    """执行搜索命令."""
    raw = client.search_interfaces(query)

    scored = []
    for item in raw:
        score, matched = calc_score(query, item)

        if method and str(item.get("method", "")).upper() != method.upper():
            continue
        if group and (item.get("catname", "") or "Default") != group:
            continue

        scored.append(SearchResult(
            id=item.get("_id", 0),
            project_id=item.get("project_id", 0),
            title=item.get("title", "").strip() or item.get("path", "").strip(),
            method=str(item.get("method", "GET")).upper(),
            path=item.get("path", "").strip(),
            group=item.get("catname", "").strip() or "Default",
            description=(item.get("desc", "") or "").strip(),
            score=score,
            matched_fields=matched,
        ))

    scored.sort(key=lambda x: x.score, reverse=True)

    return SearchResponse(
        success=True,
        query=query,
        total=len(scored),
        items=scored[:limit],
    )


def cmd_query(client: YApiClient, interface_id: int) -> QueryResponse:
    """执行查询命令."""
    raw = client.get_interface_detail(interface_id)
    project_id = client._read_pid(raw) or 0

    # 获取微服务名称
    server_name, source, project_name = get_server_name(client, project_id)

    # 构建提示信息
    hint = ""
    if source == "yapi":
        hint = f"服务名来自 YAPI，请与后端确认是否正确。如需更新: python scripts/yapi.py server set \"{project_name}\" <正确的服务名>"
    elif source == "none":
        hint = f"未找到服务名，请与后端确认后设置: python scripts/yapi.py server set \"<项目名>\" <服务名>"

    return QueryResponse(
        success=True,
        interface={
            "id": raw.get("_id", 0),
            "projectId": project_id,
            "projectName": project_name,
            "title": raw.get("title", "").strip(),
            "method": str(raw.get("method", "GET")).upper(),
            "path": raw.get("path", "").strip(),
            "serverName": server_name,
            "serverNameSource": source,
            "group": (raw.get("catname", "") or "Default").strip(),
            "description": (raw.get("desc", "") or "").strip(),
        },
        request={
            "query": _norm_params(raw.get("req_query")),
            "pathParams": _norm_params(raw.get("req_params")),
            "bodySchema": _parse_schema(raw.get("req_body_other")),
            "bodyType": raw.get("req_body_type") or "none",
        },
        response={
            "bodySchema": _parse_schema(raw.get("res_body")),
            "bodyType": raw.get("res_body_type") or "none",
        },
        server_hint=hint,
        raw={"interface": raw},
    )


def cmd_resolve(client: YApiClient, query: str, limit: int = 10) -> ResolveResponse:
    """执行解析命令."""
    search = cmd_search(client, query, max(limit, 2))

    if search.total == 0:
        return ResolveResponse(status="not_found", query=query, total=0, items=[])

    best = search.items[0]
    second = search.items[1] if len(search.items) > 1 else None

    if second and second.score == best.score:
        return ResolveResponse(status="ambiguous", query=query, total=search.total, items=search.items)

    detail = cmd_query(client, best.id)

    return ResolveResponse(status="resolved", query=query, match=best, detail=detail)


def _norm_params(params: list | None) -> list:
    """规范化参数列表."""
    if not params:
        return []
    return [
        {
            "name": p.get("name", ""),
            "type": p.get("type", "string"),
            "required": bool(p.get("required", False)),
            "description": p.get("desc") or None,
            "example": p.get("example") or None,
        }
        for p in params
    ]


def _parse_schema(schema: Any) -> Any:
    """解析 Schema."""
    if schema is None:
        return None
    if isinstance(schema, dict):
        return schema
    if isinstance(schema, str):
        try:
            return json.loads(schema)
        except json.JSONDecodeError:
            return {"raw": schema}
    return schema


def extract_server_path(domain: str | None) -> str | None:
    """从 domain 中提取微服务路径.

    例如: http://testbk.jubaozan.cn/micro/live-admin -> /micro/live-admin
    """
    if not domain:
        return None

    try:
        from urllib.parse import urlparse
        parsed = urlparse(domain)
        path = parsed.path
        return path if path else None
    except Exception:
        return None


def get_server_name(client: YApiClient, project_id: int) -> tuple[str | None, str, str | None]:
    """获取项目的微服务名称.

    优先使用本地映射（通过项目名匹配），其次从 YAPI 获取。
    返回 (serverName, source, projectName) 其中 source 为 'local' 或 'yapi' 或 'none'
    """
    # 从 YAPI 获取项目名称
    yapi_project_name = None
    yapi_server = None
    try:
        project = client.get_project(project_id)
        yapi_project_name = project.get("name", "")
        env_list = project.get("env", [])
        if env_list and isinstance(env_list, list):
            first_env = env_list[0]
            domain = first_env.get("domain")
            yapi_server = extract_server_path(domain)
    except Exception:
        pass

    # 优先使用本地映射（通过项目名匹配）
    if yapi_project_name:
        local_server = get_server_by_name(yapi_project_name)
        if local_server:
            return local_server, "local", yapi_project_name

    # 使用 YAPI 的服务名
    if yapi_server:
        return yapi_server, "yapi", yapi_project_name

    return None, "none", yapi_project_name


# ============================================================================
# TypeScript 类型生成 (调用 Node.js 脚本)
# ============================================================================

SCRIPTS_DIR = Path(__file__).parent.resolve()
SERVERS_FILE = SCRIPTS_DIR / "servers.json"


def load_servers() -> list[dict]:
    """加载本地服务映射.

    格式: [{"name": "项目名", "serverName": "/micro/xxx"}, ...]
    """
    if SERVERS_FILE.exists():
        return json.loads(SERVERS_FILE.read_text(encoding="utf-8"))
    return []


def save_servers(servers: list[dict]) -> None:
    """保存服务映射到本地."""
    SERVERS_FILE.write_text(json.dumps(servers, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def get_server_by_name(project_name: str | None) -> str | None:
    """根据项目名称查找服务名."""
    if not project_name:
        return None
    servers = load_servers()
    for entry in servers:
        if entry.get("name") == project_name:
            return entry.get("serverName")
    return None


def set_server(project_name: str, server_name: str) -> None:
    """设置服务映射."""
    servers = load_servers()
    # 查找是否已存在
    for entry in servers:
        if entry.get("name") == project_name:
            entry["serverName"] = server_name
            save_servers(servers)
            return
    # 不存在则新增
    servers.append({"name": project_name, "serverName": server_name})
    save_servers(servers)


def ensure_node_deps() -> None:
    """确保 Node.js 依赖已安装."""
    node_dir = SCRIPTS_DIR
    if not (node_dir / "node_modules").exists():
        print("Installing Node.js dependencies...", file=sys.stderr)
        subprocess.run(
            ["npm", "install"],
            cwd=node_dir,
            capture_output=True,
            check=True,
        )


def generate_ts_types(input_data: dict) -> str:
    """调用 Node.js 脚本生成 TypeScript 类型."""
    ensure_node_deps()

    result = subprocess.run(
        ["node", str(SCRIPTS_DIR / "schema-to-ts.js"), "--stdin"],
        input=json.dumps(input_data),
        capture_output=True,
        text=True,
        cwd=SCRIPTS_DIR,
    )

    if result.returncode != 0:
        raise YApiClientError(f"Type generation failed: {result.stderr}")

    return result.stdout.strip()


def cmd_gen_ts(client: YApiClient, interface_id: int | None = None, query: str | None = None, limit: int = 10) -> str:
    """生成 TypeScript 类型声明."""
    interfaces = []

    if interface_id:
        raw = client.get_interface_detail(interface_id)
        interfaces.append(raw)
    elif query:
        results = client.search_interfaces(query, limit)
        for item in results[:limit]:
            raw = client.get_interface_detail(item.get("_id", 0))
            interfaces.append(raw)
    else:
        raise YApiClientError("需要指定 --id 或 --query")

    declarations = []
    for raw in interfaces:
        input_data = {
            "path": raw.get("path", ""),
            "method": raw.get("method", "GET"),
            "pathParams": raw.get("req_params") or [],
            "query": raw.get("req_query") or [],
            "bodySchema": _parse_schema(raw.get("req_body_other")),
            "responseSchema": _parse_schema(raw.get("res_body")),
        }
        declarations.append(generate_ts_types(input_data))

    return "\n\n".join(declarations)


# ============================================================================
# 服务映射管理命令
# ============================================================================

def cmd_server_list() -> dict:
    """列出所有服务映射."""
    servers = load_servers()
    return {
        "success": True,
        "count": len(servers),
        "servers": servers
    }


def cmd_server_get(name: str) -> dict:
    """获取指定项目的服务名."""
    server_name = get_server_by_name(name)
    return {
        "success": True,
        "name": name,
        "serverName": server_name,
        "found": server_name is not None
    }


def cmd_server_set(name: str, server_name: str) -> dict:
    """设置项目的服务名."""
    set_server(name, server_name)
    return {
        "success": True,
        "name": name,
        "serverName": server_name,
        "message": f"已设置「{name}」的服务名为 {server_name}"
    }


# ============================================================================
# CLI 入口
# ============================================================================

def output_json(data: Any) -> None:
    """输出 JSON."""
    def serialize(obj):
        if hasattr(obj, "__dataclass_fields__"):
            return asdict(obj)
        return obj

    print(json.dumps(data, indent=2, ensure_ascii=False, default=serialize))


def main():
    parser = argparse.ArgumentParser(description="YApi CLI")
    parser.add_argument("-c", "--config", help="配置文件路径")

    subparsers = parser.add_subparsers(dest="command", required=True)

    # search
    sp = subparsers.add_parser("search", help="搜索接口")
    sp.add_argument("query", nargs="?", default="")
    sp.add_argument("-l", "--limit", type=int, default=10)
    sp.add_argument("-m", "--method")
    sp.add_argument("-g", "--group")

    # query
    sp = subparsers.add_parser("query", help="按 ID 查询接口")
    sp.add_argument("id", type=int)

    # show (alias)
    sp = subparsers.add_parser("show", help="query 别名")
    sp.add_argument("id", type=int)

    # resolve
    sp = subparsers.add_parser("resolve", help="搜索并解析唯一接口")
    sp.add_argument("query")
    sp.add_argument("-l", "--limit", type=int, default=10)

    # gen-ts
    sp = subparsers.add_parser("gen-ts", help="生成 TypeScript 类型声明")
    sp.add_argument("-i", "--id", type=int, help="接口 ID")
    sp.add_argument("-q", "--query", help="搜索关键字")
    sp.add_argument("-o", "--output", help="输出文件路径")
    sp.add_argument("-l", "--limit", type=int, default=10, help="搜索结果限制")

    # server
    server_parser = subparsers.add_parser("server", help="管理服务映射")
    server_subparsers = server_parser.add_subparsers(dest="server_command", required=True)

    # server list
    server_subparsers.add_parser("list", help="列出所有服务映射")

    # server get
    sp = server_subparsers.add_parser("get", help="获取项目的服务名")
    sp.add_argument("name", help="项目名称")

    # server set
    sp = server_subparsers.add_parser("set", help="设置项目的服务名")
    sp.add_argument("name", help="项目名称")
    sp.add_argument("serverName", help="服务名称，如 /micro/order")

    args = parser.parse_args()
    config = load_config(args.config)
    client = YApiClient(config)

    try:
        if args.command == "search":
            result = cmd_search(client, args.query, args.limit, args.method, args.group)
            output_json(result)
        elif args.command == "query" or args.command == "show":
            result = cmd_query(client, args.id)
            output_json(result)
        elif args.command == "resolve":
            result = cmd_resolve(client, args.query, args.limit)
            output_json(result)
        elif args.command == "gen-ts":
            declaration = cmd_gen_ts(client, args.id, args.query, args.limit)
            if args.output:
                output_file = Path.cwd() / args.output
                output_file.parent.mkdir(parents=True, exist_ok=True)
                output_file.write_text(declaration + "\n", encoding="utf-8")
                output_json({
                    "outputPath": str(output_file),
                    "interfaceCount": 1 if args.id else args.limit,
                })
            else:
                print(declaration)
        elif args.command == "server":
            if args.server_command == "list":
                result = cmd_server_list()
                output_json(result)
            elif args.server_command == "get":
                result = cmd_server_get(args.name)
                output_json(result)
            elif args.server_command == "set":
                result = cmd_server_set(args.name, args.serverName)
                output_json(result)
    except YApiClientError as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()