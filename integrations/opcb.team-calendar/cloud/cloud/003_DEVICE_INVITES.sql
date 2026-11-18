BEGIN;
CREATE TABLE opcb_calendar.invites (
  invite_hash text PRIMARY KEY CHECK (invite_hash ~ '^[0-9a-f]{64}$'),
  actor text UNIQUE NOT NULL,
  pubkey text NOT NULL CHECK (pubkey ~ '^[0-9a-f]{64}$'),
  role text NOT NULL CHECK (role IN ('editor','viewer')),
  expires_at timestamptz NOT NULL,
  claimed_hash text
);
ALTER TABLE opcb_calendar.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON opcb_calendar.invites FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.opcb_calendar_redeem_invite(p_invite_hash text,p_pubkey text,p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,opcb_calendar AS $$
DECLARE invitation opcb_calendar.invites%ROWTYPE;
BEGIN
  SELECT * INTO invitation FROM opcb_calendar.invites WHERE invite_hash=p_invite_hash FOR UPDATE;
  IF NOT FOUND OR invitation.pubkey<>p_pubkey THEN RETURN jsonb_build_object('error','邀请无效或与当前用户不匹配','status',403); END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN jsonb_build_object('error','设备凭据格式不正确','status',400); END IF;
  IF invitation.claimed_hash IS NOT NULL THEN
    IF invitation.claimed_hash<>p_token_hash THEN RETURN jsonb_build_object('error','邀请已由另一设备使用','status',409); END IF;
    IF NOT EXISTS(SELECT 1 FROM opcb_calendar.devices WHERE token_hash=p_token_hash AND NOT disabled) THEN RETURN jsonb_build_object('error','设备连接已被撤销','status',403); END IF;
  ELSE
    IF invitation.expires_at<now() THEN RETURN jsonb_build_object('error','邀请已过期','status',403); END IF;
    IF NOT EXISTS(SELECT 1 FROM opcb_calendar.workspace w,jsonb_array_elements(w.body->'members') m WHERE w.id=1 AND m->>'buzzPubkey'=p_pubkey) THEN RETURN jsonb_build_object('error','用户尚未关联团队成员','status',403); END IF;
    INSERT INTO opcb_calendar.devices(token_hash,actor,role,pubkey) VALUES(p_token_hash,invitation.actor,invitation.role,invitation.pubkey);
    UPDATE opcb_calendar.invites SET claimed_hash=p_token_hash WHERE invite_hash=p_invite_hash;
  END IF;
  RETURN jsonb_build_object('bound',true,'actor',invitation.actor,'role',invitation.role,'pubkey',invitation.pubkey);
END;
$$;
REVOKE ALL ON FUNCTION public.opcb_calendar_redeem_invite(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.opcb_calendar_redeem_invite(text,text,text) TO service_role;
COMMIT;
