-- New calendar objects only. Do not replace or alter Higgsfield functions/tables.
BEGIN;
CREATE SCHEMA opcb_calendar;
REVOKE ALL ON SCHEMA opcb_calendar FROM PUBLIC, anon, authenticated;
CREATE TABLE opcb_calendar.workspace (
  id integer PRIMARY KEY CHECK (id=1),
  revision bigint NOT NULL CHECK (revision>=0),
  body jsonb NOT NULL CHECK (jsonb_typeof(body)='object')
);
CREATE TABLE opcb_calendar.devices (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  actor text UNIQUE NOT NULL CHECK (actor ~ '^device:[a-zA-Z0-9_.:-]{1,160}$'),
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  pubkey text NOT NULL CHECK (pubkey ~ '^[0-9a-f]{64}$'),
  disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE opcb_calendar.operations (
  id text PRIMARY KEY,
  fingerprint text NOT NULL,
  actor text NOT NULL,
  result jsonb NOT NULL
);
ALTER TABLE opcb_calendar.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE opcb_calendar.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE opcb_calendar.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA opcb_calendar FROM PUBLIC, anon, authenticated;

-- Only the Edge service role may call this gateway. Browser/device credentials
-- have no direct table/RPC privileges; bearer authentication happens in Edge.
CREATE FUNCTION public.opcb_calendar_gateway(
  p_action text,
  p_token_hash text,
  p_viewer text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL,
  p_expected_revision bigint DEFAULT NULL,
  p_state jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, opcb_calendar
AS $$
DECLARE
  device opcb_calendar.devices%ROWTYPE;
  current opcb_calendar.workspace%ROWTYPE;
  receipt opcb_calendar.operations%ROWTYPE;
  member_id text;
  result jsonb;
BEGIN
  SELECT * INTO device FROM opcb_calendar.devices WHERE token_hash=p_token_hash AND NOT disabled FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','未授权访问此日历','status',401); END IF;
  IF p_viewer IS NOT NULL AND p_viewer<>device.pubkey THEN
    RETURN jsonb_build_object('error','登录用户与日历连接不匹配','status',403);
  END IF;
  IF p_action='commit' THEN
    SELECT * INTO current FROM opcb_calendar.workspace WHERE id=1 FOR UPDATE;
  ELSE
    SELECT * INTO current FROM opcb_calendar.workspace WHERE id=1;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','日历工作区尚未初始化','status',503); END IF;
  SELECT m->>'id' INTO member_id FROM jsonb_array_elements(current.body->'members') m WHERE m->>'buzzPubkey'=device.pubkey;
  IF member_id IS NULL THEN RETURN jsonb_build_object('error','当前用户尚未关联团队成员','status',403); END IF;
  IF p_action='revision' THEN RETURN jsonb_build_object('revision',current.revision); END IF;
  IF p_action='read' THEN
    RETURN current.body||jsonb_build_object('revision',current.revision,'role',device.role,'actor',device.actor,'currentUserPubkey',device.pubkey,'currentMemberId',member_id);
  END IF;
  IF p_action NOT IN ('operation','prepare','commit') THEN
    RETURN jsonb_build_object('error','接口不存在','status',404);
  END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[a-zA-Z0-9_.:-]{1,160}$' THEN
    RETURN jsonb_build_object('error','请求 ID 格式不正确','status',400);
  END IF;
  IF p_action<>'operation' AND device.role NOT IN ('owner','editor') THEN
    RETURN jsonb_build_object('error','没有编辑权限','status',403);
  END IF;
  SELECT * INTO receipt FROM opcb_calendar.operations WHERE id=p_request_id;
  IF FOUND THEN
    IF receipt.actor<>device.actor THEN RETURN jsonb_build_object('error','无权读取该操作','status',403); END IF;
    IF p_action<>'operation' AND receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN
      RETURN jsonb_build_object('error','请求标识已被其他内容使用','status',409);
    END IF;
    RETURN jsonb_build_object('receipt',receipt.result||CASE WHEN p_action='operation' THEN '{}'::jsonb ELSE '{"replayed":true}'::jsonb END);
  END IF;
  IF p_action='operation' THEN RETURN jsonb_build_object('error','操作尚未保存','status',404); END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RETURN jsonb_build_object('error','需要读取当前版本后再保存','status',400);
  END IF;
  IF current.revision<>p_expected_revision THEN
    RETURN jsonb_build_object('error','安排已被更新，当前草稿已保留；请载入最新版本后再提交','status',409);
  END IF;
  IF p_action='prepare' THEN
    RETURN jsonb_build_object('state',current.body||jsonb_build_object('revision',current.revision),'principal',jsonb_build_object('actor',device.actor,'role',device.role));
  END IF;
  IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_state IS NULL OR jsonb_typeof(p_state)<>'object' OR octet_length(p_state::text)>512000 THEN
    RETURN jsonb_build_object('error','保存内容格式不正确或超出容量','status',400);
  END IF;
  result:=jsonb_build_object('requestId',p_request_id,'revision',current.revision+1,'saved',true);
  UPDATE opcb_calendar.workspace SET revision=current.revision+1,body=p_state WHERE id=1;
  INSERT INTO opcb_calendar.operations VALUES (p_request_id,p_fingerprint,device.actor,result);
  RETURN jsonb_build_object('receipt',result);
END;
$$;
REVOKE ALL ON FUNCTION public.opcb_calendar_gateway(text,text,text,text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opcb_calendar_gateway(text,text,text,text,text,bigint,jsonb) TO service_role;
COMMIT;
