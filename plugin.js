export const inject = ["react", "pages", "relay", "conversation", "agents"];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "公司看板";
  const company = true;
  const sourceChannel = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
  const source = `buzz://channel/${sourceChannel}`;
  const text = (value) =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "—";

  function current() {
    const connection = ctx.relay.snapshot();
    if (
      connection.status !== "ready" ||
      connection.cached ||
      !connection.session?.viewer
    ) {
      throw new Error("请先连接当前账号的社区。");
    }
    return connection;
  }
  function check(connection) {
    const latest = current();
    if (
      latest.session !== connection.session ||
      latest.generation !== connection.generation ||
      latest.scope !== connection.scope
    ) {
      throw new Error("账号或社区已变化，请重新读取。");
    }
  }
  // The channel Canvas owns the new plan. This projection never imports old progress.
  async function read(connection) {
    check(connection);
    if (typeof connection.session.canvas?.read !== "function")
      throw new Error("当前宿主尚不能读取频道基线，请更新 Buzz。");
    const access = () => {
      check(connection);
      const list = connection.session.channels.list();
      const channel = list.channels.find((c) => c.id === sourceChannel);
      if (
        list.status !== "ready" ||
        !channel ||
        channel.archived ||
        channel.cached ||
        channel.metadataPending ||
        !channel.members?.includes(connection.session.viewer)
      )
        throw new Error("工作基线频道访问权限已变化，请核对当前成员身份。");
    };
    access();
    const event = await connection.session.canvas.read(sourceChannel);
    access();
    if (
      !event ||
      !/^[0-9a-f]{64}$/.test(event.id) ||
      typeof event.content !== "string"
    )
      throw new Error("指定频道没有可读取的工作基线。");
    const section = event.content.split("## 人员分工")[1]?.split(/\n## /)[0];
    if (!section) throw new Error("频道基线缺少人员分工，未回退到旧任务。");
    const rows = section
      .split("\n")
      .filter((line) => line.trim().startsWith("|"))
      .map((line) =>
        line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((v) => v.trim()),
      );
    const headers = rows.shift() || [];
    const owners = headers.indexOf("负责人"),
      work = headers.indexOf("主要工作"),
      delivery = headers.indexOf("可检查的交付");
    if ([owners, work, delivery].some((index) => index < 0))
      throw new Error("人员分工表结构已变，请核对基线。");
    const heading = event.content.match(/^# (.+)$/m)?.[1] || "工作分配";
    const team = heading.split("｜")[0].trim();
    const tasks = rows
      .filter((row) => !row.every((cell) => /^[-: ]+$/.test(cell)))
      .map((row) => {
        const owner = row[owners]?.replace(/（.*$/, "").trim();
        const assignment = row[work];
        if (!owner || !assignment || !row[delivery])
          throw new Error("分工表有未填写的负责人或交付，未显示旧进度。");
        const project = row[headers.indexOf("项目")] || team;
        const clauses = assignment
          .split(/[。；]/)
          .map((v) => v.trim())
          .filter(Boolean);
        return {
          id:
            row[headers.indexOf("任务ID")] ||
            `baseline-${encodeURIComponent(owner)}`,
          title: clauses[0],
          assignee: owner,
          team,
          project,
          status: "planning",
          progress: 0,
          completionDefinition: row[delivery],
          steps: clauses.map((name) => ({ name, status: "planning" })),
        };
      });
    if (!tasks.length || new Set(tasks.map((t) => t.id)).size !== tasks.length)
      throw new Error("基线分工为空或人员重复，请先核对频道 Canvas。");
    return {
      tasks,
      baselineRevision: event.id,
      source,
      projection: "channel_baseline",
      syncedAt: new Date(event.created_at * 1000).toISOString(),
      companyMilestones: [
        {
          id: "baseline-goal",
          company: team,
          targetDate:
            heading
              .match(/(\d+)\s*月\s*(\d+)\s*日/)
              ?.slice(1)
              .join("月")
              ?.concat("日") || "未登记",
          title:
            event.content
              .split("## 共同目标")[1]
              ?.split(/\n## /)[0]
              ?.trim()
              .split("\n")[0]
              ?.replace(/\*\*/g, "") || heading,
          status: "planning",
        },
      ],
    };
  }

  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  function eligible(c, session, choices) {
    return (
      c.channelType === "solo" &&
      c.private === true &&
      c.creator === session.viewer &&
      !c.archived &&
      !c.readOnly &&
      !c.cached &&
      !c.pending &&
      !c.metadataPending &&
      c.members?.length === 2 &&
      c.members.includes(session.viewer) &&
      choices.selectable.some(
        (a) => a.pubkey !== session.viewer && c.members.includes(a.pubkey),
      )
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (n) => session.channels.subscribeWindow(channel.id, n),
      [session, channel.id],
    );
    const snapshot = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id],
    );
    const messages = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const scroll = React.useRef(null),
      follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id],
    );
    React.useEffect(() => {
      if (follow.current && scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [messages.rows]);
    return h(ctx.conversation.ui.Conversation, {
      session,
      scope: connection.scope,
      channelId: channel.id,
      channelName: channel.name,
      children: (interactions) =>
        h(
          React.Fragment,
          null,
          h(
            "div",
            {
              ref: scroll,
              role: "region",
              "aria-label": "助手消息",
              style: { flex: 1, minHeight: 0, overflow: "auto" },
              onScroll: (e) => {
                const v = e.currentTarget;
                follow.current =
                  v.scrollHeight - v.scrollTop - v.clientHeight < 80;
              },
            },
            messages.hasMore &&
              button(
                messages.loadingOlder ? "正在读取…" : "读取更早消息",
                () => {
                  follow.current = false;
                  session.channels.loadOlder(channel.id);
                },
                {
                  disabled:
                    messages.loadingOlder || messages.status !== "ready",
                },
              ),
            messages.error &&
              h("p", { role: "alert", style: inset }, messages.error),
            messages.status === "loading" &&
              h("p", { role: "status", style: inset }, "正在读取对话…"),
            messages.status === "ready" &&
              !messages.rows.length &&
              h("p", { style: inset }, "在此讨论当前工作"),
            messages.rows.map((m) =>
              h(ctx.conversation.ui.Message, {
                key: m.id,
                row: m,
                media: session.media,
                onOpenLink: interactions.onOpenLink,
                day: false,
                retry: session.messages.retry,
              }),
            ),
          ),
          h(ctx.conversation.ui.Composer, {
            session,
            scope: connection.scope,
            channelId: channel.id,
            channelName: channel.name,
            disabled: messages.status !== "ready",
          }),
        ),
    });
  }
  function Assistant({ connection, context, visible, onChannel }) {
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list,
    );
    const choices = React.useSyncExternalStore(
      session.agentChoices.subscribe,
      session.agentChoices.snapshot,
      session.agentChoices.snapshot,
    );
    const [selected, select] = React.useState("");
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates =
      list.status === "ready"
        ? list.channels.filter((c) => eligible(c, session, choices))
        : [];
    const channel = candidates.find((c) => c.id === selected);
    React.useEffect(() => {
      if (selected && list.status === "ready" && !choices.pending && !channel)
        select("");
      onChannel?.(channel?.id || "");
      return () => onChannel?.("");
    }, [selected, list.status, choices.pending, channel, onChannel]);
    return h(
      "aside",
      {
        "aria-label": "工作助手",
        style: { ...column, flex: 1, height: "100%" },
      },
      h(
        "div",
        { style: { ...column, ...inset, gap: "var(--space-2)" } },
        h(
          "label",
          null,
          "关联私人对话",
          h(
            "select",
            {
              value: channel?.id || "",
              "aria-label": "关联私人对话",
              style: { width: "100%" },
              onChange: (e) => select(e.target.value),
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            candidates.map((c) =>
              h("option", { key: c.id, value: c.id }, c.name),
            ),
          ),
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" },
          },
          context,
        ),
        !channel &&
          h(
            "p",
            {
              role: "status",
              className: "text-secondary",
              style: { margin: 0 },
            },
            list.status === "loading" || choices.pending
              ? "正在读取私人对话…"
              : "选择本人和一个 Agent 的私人 Solo",
          ),
      ),
      visible &&
        channel &&
        h(Messages, { key: channel.id, connection, channel }),
    );
  }
  const clayAvatars = [
    "data:image/png;base64,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",
    "data:image/png;base64,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",
    "data:image/png;base64,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",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAeGVYSWZNTQAqAAAACAAEARoABQAAAAEAAAA+ARsABQAAAAEAAABGASgAAwAAAAEAAgAAh2kABAAAAAEAAABOAAAAAAAAAEgAAAABAAAASAAAAAEAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAgKADAAQAAAABAAAAgAAAAAB7ATBAAAAACXBIWXMAAAsTAAALEwEAmpwYAAACmmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNi4wLjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgICAgICAgICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iPgogICAgICAgICA8dGlmZjpYUmVzb2x1dGlvbj43MjwvdGlmZjpYUmVzb2x1dGlvbj4KICAgICAgICAgPHRpZmY6WVJlc29sdXRpb24+NzI8L3RpZmY6WVJlc29sdXRpb24+CiAgICAgICAgIDx0aWZmOlJlc29sdXRpb25Vbml0PjI8L3RpZmY6UmVzb2x1dGlvblVuaXQ+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj41MTI8L2V4aWY6UGl4ZWxZRGltZW5zaW9uPgogICAgICAgICA8ZXhpZjpQaXhlbFhEaW1lbnNpb24+NTEyPC9leGlmOlBpeGVsWERpbWVuc2lvbj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgoQY10EAABAAElEQVR4Ae29B5ikZ3Xn+1bqnLune2Z6sjRJAQkFhAQooEAQwUhI5CB8FxmziGWdbWzG2L4Oa2Mv8hrbZGyDV2C0xkISAqRBKIByDkiT80zn3NVdVff3O9XN5cHeZ5+LpjUj7nxSTVVXffWF95zzP/8T3rdSOrYdG4FjI3BsBI6NwLERODYCx0bg2AgcG4FjI3BsBI6NwLERODYCx0bg2AgcG4FjI3BsBI6NwLER+PkfgUqlkvn5v8v/+A7/f3vjDsemTZuyN3/zX6+eLE6/JptN31mypPu6G2/cvP8/Hqqfz3dzL/Tb+sRHPlL/rR/8YPZnuY+a8sSqgdGxGyampk8oTs++Znh4/K3HH7+m8NYLLnzorkcemfk/HfOV555zSe/ynleffvpZW5966qnJ/9P+R+PnL1gE0Hq/c8sNfzw2PvkLM8WZBxrq668/+dSVN33uc98YdaDPe9lZF5SzlV9MKbezsa7ujrXLVt37yc99ri+TyVTmBXHZq16x5ImtOx9raG7r8M2JicmUzWZSfW3Nfc0NDb/+vTt/eNv8vj/9/PqLLlrRNzbw6HRxtqVYnH6kq6X5HZvvuu+xn97vaP/7BasArz//9K79I8UfpWyufaZYTOVKOdXU1DxVW1P7pVNefOLn77/3wY8WZ8sfVADlUjnl8rm9jfX199YUCt/uWdp9w5e//PUdfnbKScd/tpQK72tpaUlT09NpeGgk1dQWUi6TmWpvbfrYhZe87pN33/3d9ptvvn3/TyrP2S859YpyylyXUiYNDY+k2prCliWdPa/+1ubNz3rcF8r2glWATe89v+5ffrjr3vqm5pPq6xvS1NQ0ApxCH3KpJl/YVVube3Lnzr0XTReL2YaGhlRbWxsyKdQUUl1t3UBLS9O/NdXVfWZ6fGTXj3bsuStfU7e0oaE+zc6W0jSKUESpsplM6u5o+97oyPDGqeL0P5578umbPveNKsK89LSTLitlcl/L5guZyampNM2jtrZwz6pVay/6xtw+LwQleMEqgIN7xqnrPjg9k/66prY+1dbVIrhiGhoaThlgXOFVyqU0OTmZxsanUj3CbW1tTVhxqoAWhUIhtTQ3l+pqC/92YP/+FQNDo6c1NDamcrmsgvCd8TQzU0z5XDYt6upMI0ODqVQq3dG9pO19P/zhk89c8fqLVjy5fe+j2Uy2BQKZRsfG45wrl/Ve++1bb//wT6LF0awIL2gS+P5fev2jTzy27Rf2H+zrnsICtV7km6YQuhY8w99ZpCO8T4MQY2Nj8XchX0jDI8NpbHQ0W5yZ3VBJlSX9/YPxHd3FzGwx5UASN/QhTUxOpZ6exaDM1Irx8eLrNhy38tbalsaRqaniNZOTU7WNKE6eY46MjqZ8oXDWv1z3lYNbtu2492gW/Py1vaAVYPPmh2ZXLu1qHJucvqSvfwDLriC82VACFUAh+l6xOMX9VtLIyAhKMhMIUUQhJH0DAwNpFMEVizOpNDOT6urr0tLFPSDHFN49YfVlkKScRkGE9vY23EyxfbZUuaS5of7ugcHhN+BymlpRsHw+nyY53jjKl8vlz169ZtnXcEGD8wN9tD4ftQrwkSuuqG9b3PH6NSuXn7VmxfKeU07aWH/uBS8p33ffm6d+//c3/5jJv/XyN+760dZtF46NjfeMj1dZ/Nq1xyOs9qRl1tfVAen4f6BB656eKoYSLO7pSc0tzQH5Mwgea04lBK0gyyhNPwrV0dmJRefCFejjxycmUlNDY5qYmuoYGRs/H0RpKVfkf5LGbLgbuUi+UFNfW6it27V7zw1Hq+Dnr+uo5QAvOe2k38nV1P6h0Irv5XozxXwu00/I9wQ+fhfWvXfFimWdwPKle/bsa3v6mWebxsYn0vLe3tS7bFk6cPBgqquD1CFcrV/frjXrKiR73d2L0jDsXaHPghqiweDAIPsXU0tbK9HAUGpqak4trVh3rhAEc2hwMFBFlzLI53kQRoXp7u5C0erhH0MoiUQ0n9Yct2Z8Ymz8jPvvv/+p+cE+Gp+PKgQArrMnnnhigUfuycceWT9byVxaV1+facKS8dc5iFkzodqacrlyKlD8iv6BwTMOHOhrGR0dqzEcy+HvFcwwRBD2HxCuKxhHMYT0KR8owODgEHwA0oYAh4chjUhGd9HY1AhQZEPYszOzoRgZPtWtoEOEh7WpuakJwlkXspyamuR407Gf+4gcsyirxLO2tr4GIjq8b9++W49Gwc9fU37+xZF4/ru/+7vCN7953caJ0akLianPPP+8c5bB0NsQRqZjUVfNlq07KhMTExmSPAxoTWrl2QE/hHVnELaMXiFmYerCvSEeuYCwbJ8LfKbAp/HvkkEYe+wbgjdaQPIKTWhX4PKFHBYtSZyqTEdUUamMpPaOjkCKcgml4JjFmQmUpSkJ/Qf2HwgFEwmam8klcH0leMYwUUNre/vLj8S4/n855xFzAZdeev5Fo8OTfzw9M/siBFmj9QrROYSpNTqgWvGzzzzLgBfT4sVLEXJDMHksPvZram5isEuRBAIVeD3LvjNzvn4KVs5+eY+VC2WRA4gU/q1bUYHMD4gSWrXflw+oLCrD5OQ0xyoh7IbUwLlFB11JNitwVoD+nnTwwP5QMge9HgX1e0Ybbe2dqWtR92BzY8Opd9xxx04/d7sPpf/UPd9pPnBgYH1paqpy47fv/CGX8WNOU93r+fv3iCjAddddl/vzP/34/ZPF8in6XwdVC58PpxSMAyl56+vvS1u3bFVuWORMhHTuu2z5Mth5hSzccPhifbmCBDFCAaqvDQdnQglULNm8m1bvkKtkNaCG5zKEDEVB+PIG3ytxfDhHvF9XVxPo4DndKihDLSjT09OdjCi2btuKAtRxvNpQonrI4uKlyxKaff4999xz+5vf/NpTR0fHr6yUyq8eGx3vwWV086jkMumdDzz85P+Mgx6Bf46IC7jyyitLJ69f9d/Hp2c/MVMqtRWLwm+VpKkQHR3tJmnSNFaZA46bYOsjCFqpSdS0asO+9ra21NXVgVJA2gjxCoV8JH8ipMNyFa6WLkp4XFHGJJEKF75dgohiNSA4zy98u7mPCmJdwLRwEcVT+bJzbmIeIWZRuKm55JLZyMnJCb8dbkmFFClqajLnveyc067OZvOXcQ214ySlxgkpVTgjlfaO9uPipEfonyNGAg/2Dz10/MruGyYmpmuA+lWQunr9tVAuDEvUJHPG7rqEgHiEWYXvciozgArW5MvevXshbtNYazGYP8kYjlFFlojjsWYtV6uet37Hmz/D93s+91Pofl6a5bU1I/8mm6jAZ2eq5473ErkBj+nx+F4NmcOaQk1kIcOFgSw5hC+ijQwPXkC0cTL+I0/eIBRXkqhyrFqzdvz4lct+9/4HH9l7hOSfjpgCeMN7DwwcGrr7nm/d9sAd24fHJi9gPOu1SFm71mhqt7OzIxIwki4VxFDPgZ9l4PX37qOwq/n7Gb47Fr7fNG5sHM+0sAoU2/wTzypWM0jTAsJYL9CHmw7W30si+WqQP1GEU4YiKGDRQ0ufVyrDTd2BYaAKk+G4kW5GEYw+TBOTcYz0ssjQSHi5qKc3LV+27O++9I//9NnqhR2Zf4+IC2AwM+9665teNDA89I5XfuAXLx2fLK7sWrSooalpOllYGc2PhAtYtKiLwczC6kdJx875cyxHCO/obI/Y3dDOrRrjTwc51GKF/0SOXlSYwXrdImrgs2bIow8FLQk0g+d5qwRP8WYI95pTCbdgAkg+YSpZYbrP/KYaqIzTFKHkE9YXVMQpjmeU0tBAHWJ0JN5TYVU4Namrq1tFm85mKp+fP9aRen5eFaBSuS73tiu/eOmrLxl9f6l06JWMUv1MSbKFNSJYB1Ei1YJwekjU6Cf19UYBhlYKzFCvk7CsBiJo/h7jDqLnwCqc8PepFIrgoIocwq2hoiTQtG0biR7RQ4GaDFJo82HlPFKocGHtkj2URCtvaBRhJth/Mqxfd5GbUwhzAnKH+vraQBPzBXUUqErUFbxGy9XlGXlBBsVCGbOV//bP//zPDx4pwc+fVyVe8A0ryVx52aWvGhkd//VsPn+B7NpBGcGyhVdDMC3JZIoWt2RxN8LB4lGA0ZGxUADZvVBvPn5+0x3I2Ks+vBTCkQh2oCD6XxVCJTL/rxWbsSNPH2FacA3e17KFc7mF+/ISoc3GdakwzSiMCKECaeHu4PFMIBVRHJXWc0kydVH1CN37acWtFOAFKrRRy569+3jsT4sWdRs+7l++bPHbYSDEnZVStja7+13vev/+K664YgaUQj2ev23BFeC9V7x28d6h0f9GxPOOyaliRsEKmfpuCd769evDKiR9bm0w+7a2lvDjCkQ414erAAqnsbGJ5Mv+gGdRQ+g37lYA+nJcCcpFNg9hjI6Moliwe87Z27uEaKI1DXGeUWDZz0P5IHDmGybnFEzF9Liey8GZJ5/+oWD9TL6gwvYdOhTooYA9vwqqhTeBVJae3U90MfUs1zh4qD/t27c/LV7SU2qoqyuDQgXvDyUaLNCwQv5rT6VUubln6Yq/uemmm6ohSYzKwv3jPS7YVqFt6+xvfv2GsYmp1wxjySUIkhCtMPXHGzZsCNh8hmSPId2SJT0BrSJBZ0cnyZSOCO0O9fWF0pivHyO5EzAKclizn6AApItYtXJF6uzqiqiAeDusWKvmgCiaXWIVeEEtAuV7KIxKYmp3nNeez2NWWT8hoi+xQ4UsH5glAxiugfcNJUUF43y3fXv2BtJ4LhVQgavkXfQQqATtKLNpZ9AvNaIQuh7RQ+UQOSJ6QXEkkZ5Pt9HT2XzB5jvu2xwnWOB/FpYDfOxjlYnrvvTQ0NDIheOT0zWRX2cwHfwVK1ZgDftSX19/5NdXrVwJ0RuP1+0IX+sfGOgPZl3HYEn2du40oVYNvbRgyaEDdvrpp8ZgjuISFJh+eHhIlBEFKAEzwCqJVmoBRzKmkIeHq6ijrWuJcez5cFFHzSb06+tl/CpJgYRQiXuohpx10WiiUqrQwn03iaFxBH7gwAH2RymwfFFJEiivkHyqJH39/aEMjaADPYVxrta2drhP91OrOjsf35zui/cW+p8FVQD9GdvvnHHK2q8Nj4yfh+WvnSzmr1zau6xTV6clOGhrjluVtm7dEr5cgrZ12/Zg+FqEMb2+WCt24MzrK8To6MHiFH61rIv7IGl06FAfMD8Y5dxqEoisnkLVvNmMCGaM89k0emTPVs0EzhPA6nu+X40ugpw21cXbuoHQHgRu3cBwUbLY2lotLdtBZO1AJduPq2qywMR7nt37kUQa2ooKIpFoIXJ4bu7rIBz3PZ//6lcPxcmfh38WVAG8/jlS8wA3/yBE8DcGR8ZrJvH/FaxoxfLlCBgSBZxK2IT6gwf7An7j3hEOYxaf+beh3dIli4H6TiyQxA9wqoXK5K0P+Nx36CDJGVDGL/Cs8ji4Dr7HCjXwBXuU4tkd4zrj+ApbyBc1/J4RQHtHW8jc8/m35V5RTPchaXW/uRazOIGtaCKTkH8Iv+9pzBIadVDdTFNkPletWpkef/yJqjKxw7JlvfuhDm/81rduvad6Rc/PvwuuAPO38ZYrXv/x0Ympj5Lxo9qWT6NovqHcIuCxD8FbkVu3dm20X23bvjMybPPf9dlC0MYTNgTBGsDC90KmWpob08MPPsTAGsZhkfj7UoliEANupIHsA759dgvh81wlXuQT2N83Tf54LJXEDt/KjN/FIvHrnV3twfSFeRNFEkpOxueliCxMOPk9lcMIRAXSRZiOrgMtPN62rdtC0VUKUSyXlyN0pZXwlq18Jlr42dJFvVzQw3Gtz9c/z0sm8IrLX/tfp6Zm/0jY04pNq9rBa8OF4ZmNnBvWrU0NwOV+yqsOtpvsWp+5dOni1MtDH7xr1x4eu0CCJenMM88M5enrGwARCCHhDcVZhDGXW1ARkM2PN6HagW5oqv/xoC9ZuhR2X60ZiCBTKFNEHwi5p6cLi20I0ioq6OcV7MyMaWfTxwp6PsmUojCk0FUGT+tDpShwH0YZuiTdjkpA11DUPCwbC1cjI2NNuLdLzjnntK8//fSWkR9f9AK/WHAFeMtll/4yAvnLkbGxjGFZKx029s3p+x3QZ5/dEnAoSXrgwYdTP8J0EHuX9Yav7CIhZISgtRoFCL29y5amVatXBvGLLB0DaoKIwwUShG//qYFrhVt0kj20568ICtnVs2x5b1iyhaYqWbQKaJ4/hdIt4tySTYkqYdpc6Dg3CYmdpigQaf3eB23mAfkqrd1Bpn9nyBdYV/Ca5S3V668STglpAf4gyhwinNQwCCPbKBptvPzyU792zz3PVjXrp+7jcP+5oArwC6+7+MLRyakvTkxOF/bvPxgNFFbNvOE2GG9f36GwYLNsTz/9o0gMOZArVi7D4pcGVJtYsa/PpIphZA+9fO2Eh763e8+e8Pt28sgFTNDkkL4C0f6EegUkguBjQzn6EaacQ7J5YN/eaAqVhfuNas0gJpgQpSwLyz944GCEfmpF5PnZrzZPbQEB6mZ4OxSPGF4Gn7roIzSstJBliGcEMQ6imZG0DiAPgJjEdc2iHEYIVgdFBfdlfI4fG81O7Nix647DLez/6HgLpgBXvfWNy4fGJq4fHZvoMvlB315i3l0MirHwli1bgPLdIVATKLoBSqNp7drjUgfKYdimkOqwEku9exC28G2K1Qzctu070oCt3FjzEDA6ySBK/vgnYFY2rh6sWLk8Le1dGrBu84Y9hg2NdWnvnt0Mup2/SJDJwQonKn783UAYacl5jPNywIBupJ/q89nU1ZBPS1vqUnMtilah/Uu+wCHsXdBFTaNMFoWqFUkKQxxBASvcap6g2q4uoog2rW0d5ADyKOJgfN9wt6W17cyLLz73fz300GN9/5HQDud7C6IAmzZtyj/19FNf7B8eOWs7Id1ukiUK0/SogjQ8Ghy0fl8gE7guMmzh6/Hrkj0RQkHrM7ds3QZR2hq1Aa3fVK4KpRJpuQp1BoWIkA8FMDMoByiSdxdFVq1ZE9Z1gJyDjB00Bmmo2nHscNLsX5tFEDX4/OZ8Oq6Trh526hux6lhKDYxQO8Je2lKTVnc2piWtdAfRI1BAwTB6jkHnEOcyZZTNVHsKhHeTPHwU5M/kl0rbxD0ZFsqFRKYCHce6AZFL3lCtbDIjKZutLVeyvVddddVXN2/ezFEWbluQKOD737vl/X30zCtImjkDWldjiQfp5du774C+Lgant7c3fJ/sWl8odM9n0fYisH3kz833dxE3r16zOuLm3aCGXUIzCNMJHHVYJTaI4KtFJWN+bCt1NjcAr11kCsfT3t27wpp9vwyBq0NwdfXZVI9wm2rzqZ0Yf2lnW1re3ZEWdTB7iP8G4QX3PbU9rFIUkt2rsKKKYVwTXKK5oY7nCaaijaZ9wxSsioWoBfCluVCyGBnDFjKCpr3d7BtEz9Pu3bvnlHZfcB5dgdGCx9dNUTN54y233Hg+X7nV7y3UdtgV4G1ve0PP009t2aSlj5H+XcwkC5MnTt2SGNlZ42Z+3HLvOMROy5Sh60ON55948in8L/vyPj11wPgKUONgcIZBJnJkK2T0SCRpQYZroD5WDHQXKLU25VNvR0t6ZjyXntnCgJaKqb0ul3pqsVJ2NJXbRDZvZU9rWr1kUVra3YnQ21NXe0uEmEwupYpcTnt3bE2NOZJVRc7je5A4OQUtXqGoVg+14kEih90H+tKB4fE0Wc6lnYN0ChPMGSX4HSeetJHZDOUmEjDyMZWsMmn1kkyPa61AJVPRd+/ahXvry9IG/2ug6e085pjn4VeDw64A3FCFcukj8KTCqlXLT2xpbe80NWr8b27cDp5JeueXweRN0ugffSxduiQ9Q0RggUVslmQJsYupDPq5ffpmDgsIOvwW39XaFXxbA9k3fPO63o70slM2pMkMBZ6HdqbzT25KHfnZtIsU8t5B8v15UrVY+slrV6UTjl8dc/4kmSqfWT03cpcw95m0eNmK1L5ocZRuxWBdS2Axn7upeGMItLykM63qaU+DKnexnO7bsj/d/SxuCZQzFWx0Y67A185A0sQXLeohZdwDwlUbgQwxFX4blU7DQ5Gxv++g9YwL77r168s53bY46QL8c9gV4PrrbznIGF38/quuOGXb7gPf3Yd1aC0SuNkS7BvtF/+7F2EVDIpM2VhZaEfrQylqkHAGAdfW1OEfZ9PAwUOR+TO8W9RIbR6rnpyGrYPlLUD4uuWL0lknr0unbFyXenQrRBVvvjSbDu7Ykr69+Y5UIQo47ZTumPK1ZHE1rMwD69EjiECyIVQEzGszkp6ntbOLbCXvQdSUvCGdn2nJ+nStVz8vD6nl+htxCX1MLT9nw9LEohPp8b1DqZStlo8n6FLye4asWrzkM7qPcCH6fUvS9hNoICqOM5KYj/RXDQ21t63aUNidbl8Ayc8d8rArQPW4mzJ7Dnz//6Yq1zFIQ4dQj8FEQWcQtt8J5MbgY3nCcnT7kCrNQ6KYbZ2mIVVTQO/iphx5/YE0yyAvw3JfderKNDvSnx7esjc1FrJpWVdrOvf0E9MZp5yUupcsTTX1jUEStWaFVWhqS6847/zUCLw2NrfGZ1qgNsxT+Hql6zVUEHCG7wnrZTWAC64A4YQHweCjTC+D5FulXHW2UY5rRUtwHaayq21qOVzauRuXpf39o2kYRQHHAlEUvnom+TSFbFuYdQlD2IkxWuDMjRCeqgC6ydqGptKDjzzxjQcfmZPUAj0Fmh7uYz/xSMOrhoZHP0a6NqMvF9IkbnuIBpy/t2bNyhDGICndffv3pRm7aSFnyDQEr2tY2ZZLbzhrffjfD152fvrIFeen8shA+u79Twazfvkp69Lb33BROp1sYEf34lRb3xQwGp09WfRa1Gmg38+cQZOTN2vwyQXeJmWsP+dhziC6hVAC/XC1KwiZYt0SC0PGUAogmnUAfqwwNox4fCVqksf8gEjFJEGuH2JqUqo8m/YMOH8BBQBEjPPdVD9DRCMCiWET/Q0Wi+QFooTIguoRks60nXxyy+e2bx9aMP/v9Rx2BMCCMq951fkfYtpWxhy/wtfH7Sd0I90ZcG8BSMH3USgpYd1MouKWUxqYKMHMM6m3OZPee/Hp6YpLL0z1Wi8W9uRjT6S7Hnk6dbc3pQtfelo6+yWnpY7Fy1IWN4Edzj00a4YYoSjYymx1YkfkB9hHIaYKguN6DNv8XoXaQXyfz0QCu40VbK7g9C+uChegq1LI1T+RJptY4PHsChbN6sgAih6tXKt+f8PKxWliejY9tqsv7R2nQZWT1ENaYXbo+lScq8o9OC/KYX1jCVPQh6fohyTzOdB3cO2hQ/n1nGZBiwOHXQHe/MaLTj7U13+R6VNz6rZnGfcb+7oZ0pkXN/Ejy28ARplunUamSODweXd9Sr9w9onpTa86NzV3dJFHZ7EGOnhMGm1cvRRfflJadfx6rLsp5VgYIoO1V+EZMNMqEb5WZmNVpYLAxXpHH4tUITI5BBWSBOoRagXLzZBbUOj6e98La+dYJcibyqNg4+GR52DcQ5o59Fyiis0ltqe1MItoEoHmcXNnrkcxUO57thxI2wa4BPaWFeSBOpNXdj6b8LJq2A9CWt+QD5kzoAZRmBwbP5HdX1gK0D8w0A1jn62vyf2gaeniUxi4VoVt2tOaubV7s1769TrGfYbizZT1eQZ2Y3dNOvv47vSW154fGTIH2M19l0LeTjjphNTFFLFcDVqCVWqZwiYS5H+9WTU0830kibHzGVk+Zhlj6UAxbkZIVzv0+UqT08YxLE+Xo4GTY3hajutnchdfex7RoaoQ1euNzziGDJ54k894cN4GCG9twcbUtjTL3xMQvWJ5MO0fg++ACjnut8LcQ09jYwlL2kRG03qEvQwWoFh/4OlyrvQQuyzoxpUf5i3furmno3Ta+g0r6rbsGrzTCpvJnSYqcCtXrYgbdTALCGEaVJ0gleq2uDGXrjhnQzr7tBNTDyFhFqE58A5qHeRo1fHrIHkNKVuoDYsNq1Xw7KPVV7BYXwIn+F8E59v8R3EFvYDcsY/9fBG/s6Op3wrHrlo/+6NkWr+oIhLoDsLcUYMSxEzBhpbyXc9p5tHz+Vq0EXeiBZ34Xw5QnMmkOpSjo4XaRlcbIeJsGtk2mCgGV5NWfN9NjjCLMtpnsBeOJJcQAViI4P4HH3+WhoGF3Q47Cdy+fXt5194D/R2LFr2OOsCbh0i7elOLaZVqbW2LZFBU1sh5lzA1c+TG3m87Z3W67NWviKJNTR2CxqoUoAOcg8AVGKAc8J2ByPnASSNcht3mDB4Sxzlz5nj6bSOBalNHGZhFikhZyK9OGAnD9twcI0I9pRmvGXCURdSJppNYXWROF9zHYyM043WPoWtQYCpUMH3eM8kzhSK4wwx8QFeYI1pQkfaPgwB83++aW7AwZd3B+815zbS0e19NzS2zv3T11Z8lFazmLdh2+BFg7lJnizPrZPm2QDm9W0ZtUcf6twkRe+WW9bTQO3cwvaS3KV1+0UspDC2JrGFAPwNbNbGqX3dQGKkQvBatCwiBackzlonn/gbmFUYmi/B5XRwb4mu1Kd/UnspTFGVmIGBzShPWz/VW2C8r6YMjmAQqk2eYmaLlHAEZOZgJ1EpFoxyCVwFVuAyfGxGoxIZvZRTaZheTXkx2iRJyhlyAza0i0Enc0s7hvamfEDe0A33SOGyMUfj1LQ0pN0lzCCg0Mz2z5P7Nm9vYcUELQgumAIQzK63UtVH/t8FDPynTtf1bheghw6flrOxuS7/0pnNI966KBE6EaAyWwp+HdwfLAQTQefAXg6+VBpNn4DL4XMM6/brCrUzRJj45irCZ9t3azWdVhp5BEUooAaaX8rWiR1WQER2gYArYqMTeA624oZF1J3itQuUgZ1lQyGuSORTJ+hVJ3thSrvBj9pEAEaimboIikgmeLWU3N7elxSDBhp7hdOfOsegC5hQoy1ScKzKRKJJhof0QHKl2qDQqZ1zQbUEUAFjMrF+7apnC9MZy3Kk+1IyYN2fZ12SHs2vP3bA4vYhWr1wdUMh+Qb0YNONryZyDXdG6q6IPoWZwCRG+iRIINUQivPO3Dz/PNXelvD7fT4H9MlCu3cV3eW3iRhDJgEzBFbk+P6+FZxhVkMVMj27dm7bs7Uv7+obSFEkb1gFM7ZSSeztb0hpqCVYG9fezKqzQHUrpleq2cmmSbiFAgnPxHopZ19iSNvQuSk8cnEwTlRxEEa6Aq3CMVDi5kvMi3Oh3ePad7/xPfd///tXx90L9syAK4MXi5+9pam5+CV0zBbtfLe86NOb8TYNKosYGDqXzTj0vWC+OMQQewlSwPvyGgyvLqv4RA1lCgMENGLQc7DtRhLEdzAYN+wAssSqEItalAPT9IobHNL6fAQUM/9ix6kZg5hJAe/O37N6XPnvj3emep3elQaZyFxG8m4pV7SG0VkDuHq1Zvqg1nb1+WXr1acen7jbavdlXP8+pQ/kI+wM9PHUWNKgnMeUKZKs7DqX79pAe5riOhYZid7ERgJzE19RTdlx99dUQiYXdFkQBEA7jdduvv+SMa87G8l9aZdDGvwVIIMpASdTYfkVnUzr9pLUQH0gVFqIFCbn8M3fXPosBzg6qvvYYCso5g488/FR6DCvdNzCaBkkyFYV2BNODMM598Yb0ijNeVNUjTZDNAdfOdSfW+iWfFdyEyliZZd7B/v507Y33pqd302BCOtr4PEesLpJb3RPqVbwM1i2CbD0wlJ7dP5RueWhretd5J6dLTlubJlUsNhXGruO4eqBGboAaBDKsX9KRHtg1xPFAAeoZAf986sxmN5UXRFgQ2cQJfuKfBTvJTdc+ajGvxRRoneVUBsGih714IyNDUSb9hYtOS+2ESTJlcbJC/BZE20FAESoRy+kKXNsHwePrd+07lL55x0Np8/1PpENjwDocQIJpMsaOG3MOD2x5Jn19833pneefmv7Ley8HIEgDY/nlYnXWbrR1cz0KST5R4v1ceSbd+uCP0iARmCVoCWwGmFaAaoDXJRpFiBj6CZporehs/+hk+ssb7k37h8bTlYSyEVVw/SqYSqdL8RqBn1Tb2JqOpyW856m9qS8mNjNjyeQPYaI8xspprpUooKnlwE/IacFeLpgC3DPwGM075LwYJCF5PheuYtsyZR7g5ScfF9DLiIXhRyzPIJmuFZIdQMM3u2/GEfZnrv9uuuGuR9Pg1Gz0E3SQKXR1D9m6VTkjjEEWYfB1Fib9hW9+P73+3DPS+pNeREIGHdM6teCcZI5Dw/SdvSvjr4V8Wc17/MknNV+OScUPYcyjlyjhay9JoaoYdidJ+uL6ef+fbn+UfoS69NK1S9nJqqKzgdEQyatkFSWowQ0sXtxLdxHdUVv7og8gxz1PF4mWQJxYwYT7gQ9UYWvBRF898IIpQEdHbYlESykgkzGS5Nju5SDaGNrBTa9b2ROxcDWWl+jNbSEk8wCQMhzptj0H0se/eFN6ZCfNpJRMjSKESadXWTyJNm4QwH6BSVDGpIrvswAVZeY9ad2G9Vg5fp5sn9bvgWcJ/RTg9ARzFmXy8IGXnXR8+sJNd6VJBMBq4dp+KI1FI+Esh/R5iRtBeRC8S9HKEAxbfd/3rv/hU2n9krZwU5kSyMXJuOXgD5JSUadQ35xWwh/uePZgpMW7CX81jFkIpd3DohlR0wtbAT70oWuL133ltNshfxtca9c42lBQwUkKX3rCklgjp5KZS+jEcJt1o3lCIYkcKM3jW3elX/vb69P+EV2JTHkiYNL6eRR8hFqg2VDNPn2PbwVSBWijo6c5zxyE4QEEoKRAFl2Lrzlf1aqBZ8rI0wjvlDU96Q/edXH6+m33pmFLtjQmtJGvbob92wfYSCcRvyUQPGKcKKZvaCLt6B9L2+gCGqQ/ocx1DBLy7tx7KK1Y0s25RBKTk+YTXIXMSIWyN21sK+lRaKjZEv0Q9ih6PS5Pp/vwvlGCXV7lQm8LhgAa0GWva7v50ODE+x0IY/7qNGqgnSHcuGIJ5Kcm1gDIZszkaaGSXr4I/Gt1/Qzm7332X9NuauuSKDuDZPZ23jqowbhRrFrMs46iUiP7xKAj7W6c81teujH1Lu5ME5SRZf9R4cvoBqqQrEtAfUIhMkD8JEJ/2cYV6eTe9tQPl3DVEK/HFLKdQza1GJqqOD7M/Nnmdqh/KP1oX3/a2jeWugkN7QA6SNOr3cVlQlijE1Emi2vL07ZWqGWyC/0LXYSUu0ZdQEK1rSKOoaBzC3lvx0IL3+MvmAJ4cMjbdtj2DLBfcCp391wPoCddST+eTNoBNvsGgoZgfAqYBAq/dff96RFYvhA7iXXbb1/GsmnejQ7d9Ut70qrFHamXZs4OpmHL2iVSWn8NfYOdrvVb0xCWVy4T+yO0qrtB4Tjj+NChyEXk6SWQB0xEuxoLUXCeWqqQ9gcaz/tstQ+pBMoEceTaq6uGNMV5Vq/oTawfnIbGWYSaCMIEkfvPp4yp+aKA1USShLalfVFa0t6YdoJsTmcz2ygXmAS9qrOQ8i6LtuDbgirA6tYlPzpwaHA7de+1kiGhXfgvYLHtzsWTVDGQEp9g2CZ8eM9cu1W7vuGxsHpzfjWQxnWdDemCk9aks048Lq1i4oZ1cwdVPYqJGiIIaBOvEaLqZT0gRzo2wjLSwJlZbpnjSzJ1NwXqDirg+OgwilOdOazFBnk15ETw9i+ISAq0QOLJ8/kdj+niTyqo52qQEPJ5jjSw/KPaR+jCk9wXrefzhFKLL6B0K1HcH2w7xPtGFOQCUDpnTE0DPU2tjS98BPjzf/iH8YsuOPte1gZY68QJodGbl8S1wZaFUUaVrB6DwwD5GVoSWm9Y9PqXn5oeeOTJyPq9+oz16Wz6/jq6FkU4VZ2V4zxAuBLCsHDjAPsQTt38V6tHyxACVh9KCH9nf/fLEynoMibHq42qkrrIzSN48w2SMb+Ly47kjHUA91f48LtwAQQopJ/ZD91TEWzyqIG4mgOwNhDwT20hx+QPF6LOW8r2CrkeeUJN9ukYl2y2mURRQ9q/dw/fz9z7htPXDl555urlHSdvOHTVVZsiYPSeDve2oAjgxWYrpVuxl7crDYXhL3fkp0ajywfz1UR5n+AbOVoQ8W+bM7WuJZ2t6dpfey9CwVLp/OGjamaNz0K8IWEEwt+SpxC2SqQ9+jdWHvuBPBmEJOcwp4Dm8T7nwa24yuco9Ql+OSx4ilk5j8ABY85CDX6/gRDRuYcqbIWEUBkFUFFECV2Eli5KqTDEvfGY4ZlWB05vSBtHjGvyvlR0FWkJ6wVJNG0U1cVMgI650QPppeuWnjL27GMPF1qaaidHBvd88VffdlNta9ffvPV3r93ipR3ObcEVoLGx5a7h8WmSdBXWUjTexQqQwTyh0g0EAWJAZPFZrQmyJCmslHitVWE1CjnKsDBlRpq3gXHeU4gZU8MhNlK/WJmQqh5I2BSSft9yq/MHHfwKpHPWPAOfG53o80foW4hCFPsr4DyM39lKrkym+A4xj9DJKgOQOwXme00os0vF1qEg/s2FBwKYjjYjaQJJJUAX47PoMeC+bExxH8vjHfRJ7BopxnI3zaWJdOYy1hCsz7bUmKkE1UiStlRGKxsnp6fe+bnfuOpX3venn/9Hj3a4NkSxsFvr+Ow2hPRks52zWJCW4+ZgREHHFC+C0H1Gt40OlhH78aoeCEyrlSBZLMqRVMrjK3OEY1lnBc2ldLVEP7OypyVqabFhgcqiaqG85nOh3H3iVIjO1cj05aZ6gZjww64ZYJ5+ivTs7bffkb5+8/fS/VsPpcHazpR6N6SZRavTrql8+j6/FPfko49AJicROgpWPSvXXH2lQ/PazGzKBWZR1hgDrquetralTEjRHU2OjabaylQohKGm7sRoyXGaZumc0sRgd3Zy5Atf/v1rrpo7xWF5WnAE+MLmzVOnv3jj1wrl2bmFoSV91Vy6EB2CUuABy96TCqDwsG4kFB1ADCxfiu/xIo0PspLI7u1p/549sYwcIxuZQadX9SwmvGReQBwCdAjfgnYpDiOE4Bl8KDsv04toU6cLTcVS8gy6zSqGqyat+g7uY17B3WmqoTMVVp6UWNuYa6pLq9e+KJ3ykpeEy9iz9dn08G03pa3Pbk3HHbeKzxU5x0cBwv9zTJ2KxaCyTarc66wCRYkLIFPvoo5UZjKJ/KihiXAWl+D5c0x4sbM4g/uwnJzn71QczZUmhz/5T3/+u4+841f/4H5O9Jy3KuN6zof59wd45sZPtvz2W171og9d9opTcsXp9nsef+biHDM5hGe8abrs3FPDwtRw7HUOshUU/zFoQrdbCA6FEcJnJkbSo/fcnb532+3k0Ykk1p+eujaenvKdy1OpvoWoYTQd2rWDqV+UXu20QQhxHJQnytJh/ZSceY5QDqifomGFtQuikbOxsR4B5IFmrBLl+bebbku1KzamiYbu9PiWXemOu+9Njzz2VLrjtu+lPlzCqaeflhrbu1LPmnVpbx+1g5ED8V10SiAJ5Yob8z7m7sd7yhPy5VFSr218dCjd+6MdCDmX1rbn05K2xriGChHLBDUTrd+VTxpQCqMRNLuGxvPjXvuO933lhhtuCOfiMX/W7bAjwDM3fm5Ra3nkvxCwvwXprW6sKWQvf9nG1JadTJ+5e0eyN9giihCnmYaAuEFBOkJBSSDvh+ARnO7B/cb796c7b9ucBjNN6eJrNqXVp5yVHr3v3vTlz3467dyyPVj6Oa84O511wUVp/+N30mg5kJrauvg+6iXP4ByicrSUqRBM7vAatEihP9q2uK5aYN8VPR599PHUtHJDmmjsSpdccmn60Lrj0+VvuiLtZ5bSCN//l29+J7Wz4MSb3v4O+Amrnp16dtrzg1vS6oYasnvMD0Spcwg1g8LLcqqhpcUlL4K/cYXlQiNLwrEyeoMNLdnoL2hGCW00OcB0ermGfGm8bTTmJDbzXaOjmUzDhfmDuy5g0G75WQU//72qmc3/9Ryfd9zw309vnzl0W2Mh/XZNXeNxucZ2+qJbU31bT7rkZWekZS1YHueImoBIL6sGAbTzqoXMIQHvIHO4oJANmyZJc9+d30+TzcvS2373L9L6M89Nj/7wrvTw/Q+lS9/+i+kA3Tnfvuex9Bd/8el03T98Ja04941pIm+9QL9r9g2/Lzdg4EWCmBbm30Cw/tiVx7wGXYQVR4WzjdLwaRe8Kv3gB/empygQ/ctX/yVa2xWgxK5MCPndW7+fDu23kdNZRcA2SDRKu1dne3NYMb8ZA9njuKqAXEWtZrN93F8oi6XmYP9OVq1jMmU331P5DzKHwmSW9+7wDJMPcaa1aOBk19wUy8qUJ99ZPdpz+/ewKcCOb3zixLqp0X/NV2ZOHJvi5mgH09dJ7jKkYWtJuKxb0h7xukuvysCqRI1LEAG0ekYomLu+2pCQ91SQA7t3pEPF2nTpB349IoIp+vyu+9yn0ykvOz+deOqLyQXgHjlPkXTw7d+9LT3xyCOpfs1paRbhK3AFO/8I+K1lzWGuJ5I7nhdB2ZcnQuhvTcfWtC2KqWb9rD/wpS/8Q/rra/8mlraxzVvSptoeovK4Dx4iuXWNgizHJLNLrsK5fSAA92NxJxAPC/d+uJCIMqoNp8yGQgnbmCOIc4wEWf8Aaxdw7zk4Ql4ugPLi/0wOBZGtxw1kimQLJ8fOv/7666vtQ89BBw6LC9h22+fr8gP7/7YmW+mdpB16tkhWjZ48tTx6+ciO1XOT63tZPmX68VTSF6t6moTC5ymEzQBF1gzNlxdIAk2T7mCRiRddfFlqYKlXrW1iZDBmCv3xxz9Gq9Zs2rlrZwhRZVMwWx57MJ1w8on8vg9wTuhpuOgpPF1EFLSf2SamW/B3hRSQ5V/b1ez9KzFDqQXfbu9CLZZ7oI81DTB7ezk9vsep55+YGsh79jlMk8J1kqnXL8JYu6gQ4YgWHtvzm6tQoatuz4QSWUqQo7u9NU0VLGShxNyPaOLkWPfN5XiAINFeB5o0Mo5F0s2jQ329g4/fdwJfuYvHz7wdFgWoHem/vKGQfflUMYv/Yir3wb1p+5OPpwN76WkgVbt89fJ03IYNzOJdHIkPf2xJQsPYxCbxi7vnLwdJ0NRYRIMSdXJsKfWu3RiFIL+kOGsR2r133h1WHoGlAuEThaIQq907CANLioyjWOqxVQb2CZVA92K+P+e1gVVBYd5BTmuZVt7d28vqZcelvvseoVO3IVDLaQz1aG9TuZjWLF+R+NVI8vc0oTrdi3tvoxspfkQCMpmoCVTw2XmhHIWXB3h8a8txn4F0hfSi1b1ULC0a2aWG8AlLo9DF9UaKmBBYjmDXlH9rO3Q4Z4cH+tfx8jkpgMd6TpvrAZdGh68yAWNBZWjfzvTA92/HPz+Qtm7diaU+k2779vfTw/fen7qba2mKZMVuzhpCd0DmJR+3hddmFIK0IWBMhf9Z/buTKWJYp736+k8TL2edfWaqQRp5BokCW2p2nQAeTfUs83LCyVgJ6/0ZRmnhDhzPhnoZFYHzaoXRjk3Yh4aEwrjeoMrCmgapg4OOsFTt+z74ARpAO1IDAu+ihbAHRG7ndSvT0l958fkhkCIKUAGWM+P9aRkzmCwqzQsKWVPHQOaiA+eXh2SteRia8lyhTrGGlPBysp42ykZyizGJkfF6uU5XT5HDqLlet6kTEaw0OW778HPanrMC7D21ubc0O3WGdfqpof60/amn0p5duyilkvThJptYUKmDCZ1beX//tmfTqi6WRQX6TMyY+YtJG6EE2CSDpLC8UQeAu6dWzwzfZnL2JFCCOJFFc7HpN7z7Pem8l65P7ezZBjAzm58FnDLp0ivelJYsX5mKQweZdGoKGKnp3LX8QADgGCvKUSW04FQDQuU5nwgQS7vZOMKpV/V2p/6n7kur129IH/2jj6eXn35y6mKlkUV12bQOi73inW9OK487LhQtQxt6Gj6AcrcDJZMYAplEzmG2LxJQWjLHdLCr0Q/kFIEG32E/0chz2i9hmGxE4nxJX4eBMI4SWaeM6VrkHH4nU5OvNhGy18+6PWcXABlZh5a3umZPTPqkS6cKXxlW2aQXnsYHFzyIZg46djYubkxb90LAGIBqowQarWUgJJ/dqsPh+9w4LVRtnVjVvu2pbsWGUB6ttL6lPX3kD/8o3XnLjWkbypVHkBtPe3E6/oQT08zQgVQzNZTalq+NgY5IowLxRAkCZ5lIUoFUVbA4RpNeAgYVpWQmU6xY2jLbGuesw6/3P/HDtGjxmvSff+vX0n64hgRRYjaLcLT87CSNI9Mjae1S0rqEcGOshRj9nJyrjD+nTySs3YKXri0E6istG7ivTOPiMATvyXqABjA5CXfCVagsXrLwLz+xZb16OMLISrbSUFezkwM+p+05KwATKrtrgahZMlZFlEBfSERDjrw9rcBCnMzZQBewU7tk4l0Ufto6ulNJYSt0BiL8Ifl5BR6WCuxrHW6Gih0r16W+/bvT7NhSnSTvEbvjDlz+/bzXvSm99KJqDcB275mB/SkztJclXnpjzQDn/GUlVHE0VAsLhUFFN3CFKKWMQFu4tlaaN/qYueSvkLiARbmJ5Etjc6qZZk7ArsdSMd+QmvJwDBpNZilm5Yn1GwnJWoh5O5jkkuM6XeihAKRngGetl93D/5cCs8164tvtgJKt8vD3hiso7jwpNLpQ6D4zMt59KIApZkPnWCsRpSrhOqhvjBba27bHbT2Hf56zApjCrKH1ih/FQnuFKbNphfjVj24WfWrhp9FcssU8vR0/GW7g9A0r8efV0nAlC0QzUJH2DQPh1vnb24+5/xxTP97VvSQN9/0oTTcvpcuX2b4Mks2fKt0MVlTCBZXHh0JgS3sXp0VLl1fdC4qkXsVIBhHEqnLYEefIwraFan92bimw2zf8LD89SycQaxg1E20YJtZQt69HAGW6hmeYgzCLEHMoTD5bF6w/Ayexoujs5zxCte2rhAuAzse9Zu1GhQwSkMY5zUJaJhaVHA+5QpWjsAfnCSPwer3kuX9dRzB++obvOufQlnWSTI+//zdO33P1b8ZOP/M/z1kBqO71wV8jZ2/zhHP+JqiitbS0xTIodfTbGXubDyuOOi0cC0T4Ff1zWASCqBCrg3UVBjjCQG8HC8oQAmUVNvvrTTtYVmV8nLUGyLfPWjFEmcpYcQ4fXAeyNJIC7lq1HmbeGYw7QxVR0sdQB8wCulwn76FU+lHrAaJIHejVSZ9B54FDibUN0xjKtEhlcQukQrlRyWjqNCePuyiBdPy6R9VakXEWwVf4BfKMAve1XEIX42sQi/bYIHyIGGOguygQDjTBgLjzcA4igbkRFUEU8GG05Goidgy5nsCIRJUx4QfKv5HJXDl3kdVL/Vn+fc4KUMrmdhRxjDWZXL3NlZ38nKpkzR971GcVeM9kTJmJF7XN7Sk7zZKvkCIHNuJiBCFcOvdeS3eefbB1UKUCmy7XAYdYRMTyWEAjfQH1sHvzASWFQUYum+f3eUjCqGhBohCMlianyGC5ErMoNokGDHCWnjwZeLH/EOycU4Ik1vFdpq6P1vJ9rGW4HBdiy1eVdc9FJlxIhvOWo8ec76mkWrP+HSU16J9FCWYRVBkFKKEArj4qoZtFAXAMyEhEM7aHB+DvRS8m0kbmzx5Deye938gXoBgupxc/UcO9DFO0Gp6khyHbOFLX1nXdzyLwn/7Oc1aAxmWrdow/+cDW2nLtiVksqoWl1VxowZSqFlagxUmIy2RpvULYmeE+BoJOHixMPyfJCW2XDyBYMJQBsnsHZRD+sUY0KMgcmlNN4CCsAku+1TBSTtg02aSCCMNIjHPhSzyXbVhEDWX8tY2n1dCLz1G0KAiFpaJIFISMAmTYdhz5oxMDzDyqJ9zMiwQcH4mQk6B+wH+SuajugUBRtg4yWbVelV83EOlenv3V0XGUYhqFm+EasoSXGY6Tr+devFfGosR9T3Gf3rNEcKZMJhKi2VjPeIKorpJS5N4mOJYuM1/X8E+//Cef2vrTwvxZ/tbrPqdt7WuvmeYHob4b/p2Brwf6O5Yux+8TonJjWQZOxSi0dacCs2JqWLDJFKnsW7hT+M7oFfKF9ID1CaZjYUUZH+Z55x7604wZFSC7rGXxmGFw7bgNIeHTeRHHVrPkCTEplNfCvpyCV9ESVqT+7lo95txl9CaOilhYzBhmnx07d8XnNqFaGQyFCvJFPO41o2B2BznH0PML5SWupwr3Qj7nRmE9LoePDJ9ZPi1c+DcvoVLFzGSub4rQVgNxsahO1gtcxO8UdMGfmqhq6iCcd+hk04lyGmhoa/vEcxLaT3z5OSOAx5rI5K/LT09/sCFXg3sj7ZsncTPBoogogLNv9HlCsRCdcANF/LafVbBixqY6oAxq/KFX47XQ6j6OnrWEDOzZefyYBgPIZyoR/+tGlE+W/XKsBhqbCMJ/kkkHWaHMzvp7Qi7VBlEbOAQ827g5g7+fjHX9BqhP9MHiJyFm8oOtO/ewuPXxwbzzCEhuImuP43HMUFzOoaBLQj/K4MO/K5A0gcOZvzabOLPYzAcQE8dWASIH4LVxkTbG2O4u0uFKY8Epmb/hqSuIVX8HgWN7jGzNx/+vP/nss9Ubfe7/HhYF2L/qVT/IPXvD7c2N5QuE4Jp6LB3/r/C1nhJ+LkPKIkc6VXSuAwUmqd2bJy8jSLN/tmHlJHYMvq5SaFUQ1dq9s4GxGBQjOn60ZJorVALXCEYE1e8xWE7czDCg7quimG+fHBsmSlAEnBw1sFDF1yJs20eVbSerlY1imfSvI5iqOzk4MJK2bNsZzRms3h0MP/xyIIvI5Xlx+1h1JLQ4XjSAIHAXldTaXVPYplWVxbA3vh9aqYKgtUwWKRPFTKOEtsrl4DvVyS0oBcK3DU7hV1AgZwxnCvX/87RVL/kfKd343CU/d4TDogD+Gvh3/ujdfzAyPvWKFtpfa5gHn9d/QgA1zwrxsv4uYnCstsBiCXksrshAoeIBwYZTCijHe95wBR8YIZMIoNwgahkQRLcRC0EgyFAWIglNvYLghXxMLay/jNKJEPr7QZJT01i3hM5x10ePAfdW8w6giKMMvueItCvfGePaZkCKvSiGi1MZfwchFAkQdCwwhXJFZdC/OZHKamlZghvLwnAtRf7GxlEMBM6FOXOIHUPZbXBRISx2uWKKU9rydSo1Coxiizp+j6doTceibuhZvfH9F2zaxB0cvu2wKICXc9HvfOm2b/3+O6+tqcl/pDTIb++av29wWViEwk1KdoKckfiwFSwXlsAXgcNS9Ovbv4+VM2hRsMGnuvmW0oksIcrhgMrqGRUIkUdlY5RUFhGhjEKoGJJCB9tZuUUG9aEnHk/7hyv8+ggdN1SMhsYm0wiCNkK3EXXfoYnUNzieFrVbuqY8S2LISqMPm0bzaI7RicjiWVU2Ezy2h8+o3JyzWv3zPZyNwuPZiEFL9rq9JsPdatSD8jPdzPsSAUxTxyplFpEisgAgWE4O98kMlIZPHbdqza+9ftO1aPXh3Q6bAnhZ2ysNH5090H/i4tapS7wZ27JqgfsCzY+EBFU41wrn8gGlMpwAAetf1XYnZuQZ7BAowlRHyqbTHDT8f8wZVPBaD4OrhVdsDOVv+wc8hgpXtVAkw0AaLi49bmPavmNXeuCZB9PDz+5mhfAWfruA4hLHnQWdhlnqfXCM9fybYdhELYaUbroTV/50PWMt1pqB1sn/Ybmu+Yv34RgoiGVnnhErwgcNuA6wj5XQeM/X3Ibf0x3kuQcV1RXJuEjyC7NpEYppJ5J6bLYxUyhU8g2Ndxfq2//sw5+58V9T+q6XdNg37euwbTdsvn/molNO/Nbs7ORZhUx5ZdQEzKDJBbBohejqHpNM1ty/9Zlosqwj3VoNpYA/Bsc5elEwAfq14IB1BtCBUugOoq48GD525bq+RhEOaBzfc8APTDvHzhzG5FPvMo4mDwAADsNJREFUilXpxBPWpeWL6aHgeMK8j3Gydq4J3MxMpTpibjmG4Zihawvr+LaQgnUKuskZDhWbIZ6TSQw/1UJz+iWURAV0TUC5hPDv+ocuGFFEEQM32D8PutST0KrnuLVOB89lzRu/N58pfa+2sXkXk1Ueqmls+mpT15JNp7779/7wrR/+6JNzp12QJ4fzsG9/85tvb++eGflUR2PdWxxEQ0Jr2UK7v/szxmzYHVueTbO1LemEM89GzgwPhRd6rhKTykFGCA/QS300KmRZBjhLijlr/71ED35Q5rkCwuhdJU5VzVCHMEmEZeu3CShLwkrO8M54W+UbHxmOlTl37drNWv9k//h1EIh7CN/vuGBDC23hi2jU6OY3A9up+RuXW6uHItL8gUJD8OrJ0JUReAUl4oeAIyU8Qk5BJSA2DjczRuxeRJll8C5S0dCxKDVwPHMMzfyOADzgmeMvvuzEM844Q/B43rfD6gLmr/6X/+TLNK1V3vbFD1zynfqhkd9qqq1Zo980LPIHlPzx5oG+PqBwMG1EASLhAxz6U+wlPjckymE11fJt1d+6ni5mSTcGbgNpVTJW0sjwocJO+RJ+FbY5h+AaXIwhovn+iO39HGFYhWz0d3oUAEmWxWT/9h0aSAOQRHP0UXYFzrV85+nJvlWqMquFVNcdRFO4jgLNn1q1UYY5ADnAFMig7xeVjG6KnL9kQwCv8wg/T/SSp1E0FMkQj+NSS/nhkRK+8loQBagqQqbynk+lz3zyqtf8a25o+C0zxcnLyXadTGNjK36wzNJtfRNTM/dOTk2e0tjYusqcmCVZ8+2xpCtwqc/XZwr3EUXgSqJXXqIkAhj+IXC/5341QCsSRxhYJIOrQvhZBpT1+/wTHUKMeihMI1XKWlCklXL12Cg/XEGJ2C5h+/SMHnQj9vR57MjZiy6gmJwlkMfMHMJV4BO4ninON6vg2X+KSKPMdwNi8RQxkUWhc93hNiDDfpjJVm6ujteR+XcBFaB6Q9d8/iZ/AuSv06bK33xq+MolMxN99GrXzdQ2tR28+i++3P/qy3/lYwj1Y7oGbD4EZR+8BFAhGK8zv7DK8hlA/bspAcXvFK/qRE9CSIhmCB2B80kI2Ogj8gYINBpQEY4CtAlU4bImP9PIESioYGbO2UBWGHkrmL/sv5+uoD5+6+i4NatADLKY7Ov3QzE5jyTTKMCl4spYuygyS6eS0YGuSH5TPS0KyX+iU1ZF4AbJF/SVM6Vbj4zoq2ddcAX48c1typQ/kNIe/vYxt30F//3hr5ON+w2aIOuM08OHC65YkX31zvKx6IIphnWaCczAB6rCJo5WcfDPhn4mYoIc8t4UkUYFAtpAZVCJzg++mUCRIXrvUAwhPAuE+wvlOZDB6ptK4JqGe+EIDz+9IxVzDenM09tDeIiQa0dVRSoVFumCLcH6JX6TpKYNHae5fqMB8wK6iviP73AxCJ/+RZWoUrr5XR/9q31zg3FEnp4/Bfjf3N4rPvxXj37/r3/l1tpc7rUzDIwNnfrYSPgg7AixgEtj6yxhktAf2UUDA5M/fMfikUK2Zm+fgS7k2aeeYBbPtvTyl76Ijp7FZB+bObZtoxxHi/eYWG9MJkUBjMXH6FgaYXWwA/xA1e49h9Iov/60fsMJ6cJXnhM/FjncTyHLdC/CFQEUpBzEhNYkSiP71x1Mokhm8AwFVQBXKtW1cOpAD1UIxS0XCtnP/2+G5Xl7+4grAINY+fYnrvn7bE3htWRgIhliaTg8PIgQCRJq/fB6au7Iv6YJWcMJsKuwRITJqIblK3h9vkjQzUpcr1iyjlY91uq/4774cakmQr16HgrOJg5/r8D1/1yaTQ4wNkE5lvM00BS6fuMJae1afjiqkz4/cg3+TiGSROA8830ftrTZoDED+hjn+5hQQRQwD4FLNxCCR6m1ftu7SJbx3ek73r7hvO/x5hHdjrgCePcz+crNleni/VS+Ti8xh2BirA+LqxKxINExggwf4x79/GHJwQKiri7Bm68sKhuXd2k9jh+jJoefyZwYOf++A/jy/Vg1Zd4pohAjjQg/IY35hq60onslvQydTCejXgHnMK3r+fzdwkxmMpTKtvFAEIlcKIBiNrQl3idK8TPdgilfQ04zgOYPFHqsNQw6qHyqRrky++cZUuje/5HcjgoFeO01107f8hf/+U+nZ6avM78eaV15NmFeg+1kugQGUXIWHIGyqBGCIZ/r/IkINmDqHmI1bwZahZhmjp10MUOTyaJFTYR8rRgkhJDPFb6IUQIFrE5ajrXbeHigjxw/Rk820F8UneVz4V6BS+jiWpCh6GFK17l6WrqcYpL434dcILgJ+yl8mb+t3VkU119IJ/T79q7apd88koKfP/dRoQBeTGG06/rJhgO3kgt4pT/9Wiej1uIYaAdNe3fzB52q1gQJ0/IRTjzra4nVg6WDHhGeKWQUxDn5NmrMolBm8WItIPy+tXrft3Lnmj4qRYH8vI0sweARukKuLu9GgkpCivL4S2hyE7Hd5WldWmYarZH8hfB5DxCI2kFYP8pq13J09ZZmJ7nk39v0x5v0YUd8E4+Omu3f/uyDp9Fr9z0k1lTAgjMMMu6XXj/y81hQNcGDFQaJAwEMvWTaRgL8ZwnatGyEWmT+qmGY+QCEBORXW66wUgifZM7ZtyqAJNLvGwFExhLYtq+Bt0LBVERDUiEofucPomlhx2O4tIxWb83fLKCuQ5gP6A/4p8uHxlIrpM1EGiSt/ug//dkXP3q0DLrM5KjZvvLte/e97mUnFPmt3ksc4EjxYvkKWRhWEPPv83G8rw8W7kPoKES4AJ6DL8T3qt9FgnP3qVSr4aJJJzN9LszoT7757OQMn4X66AdEiEK/6CCTj4YPNEM+MEHIN0oHMYtg8Qy6EA3EtaAAWr4rmHgM1wduQIkx+TvBkKuvv+uRI5L2/Y8EfdS4gPmLq3m6+FcT67NnNBRyb51m4GchUxCAqL3bs5fVGpUhQqglVRthoJwMgRkbCPcsRBF5gcj+uTP/257lC1fxsnVdIcfcg1A0SZ9IAf9AYPpsFcCzxC99cx3hy/lMwZeh+xOQviEs3oKSFUOTRuyOwCV6wr8aykJTpJxd3Rxk2MNqob/47k/8A0WPo2ebN4uj5oq++sQTlTe95mW3To2NvwLatdzESsTQjK7+WDEK7cKs+QB/Pk6f7d8hUD6Lffg3/kbownwkiNjf+ru+vIGZRbaEx49JIHgt15KvCqLVur/9e7EOMce2RmAoOI7b6GMKdz+NJJNzgvd9Lk09Q7FAEI7jH65s1sScA449PFOuXHHNX193WJZ1OZzCOuoUwJv7+nfvm3rtOafcQmLnlfjSxcbZ/jBjNQxDUHMCEsqnsUAFjrJEYsc8QJiiB+K9+TqBkYLC9wepfCDhQAuPUd2zqkChWBDHmLwB9fTgupNJ6gTC/EGWhfV50vgf0qf1q5ghfOJ7f2oeHcIV1ZI6bkUhasbQ1Hd++FP/65Y40VH2j9d91G5f2vTuFaWxsa8REJxp963pUzuJalAAXlancWOZrrRhGXd+VU+rbrFSGIpT1Q4zjDZb4O9tUGVfp7D5k7XmA0wGRbsWIyFhtIlVy5emTyF4f9t43Ewhr4dIGLmiiC5ABQjk4GLkDvVEEJJVFaKZ7mhCwwE+ec8H/sf1Nxytg3xUK4CD9ukPv6GHdec/V2OqGEFjXLE4dAOWFsSNAbdbN9bXxQ5l785JYFFClKIKcNYJTP+Gq0B5JJOuw+MWPh2BKTQZPDARMb0rnNsJ5GycKdK8w7SQjc8xfheRdp1BlYvdiRxAFs4nSvmmK6FSdtzK0d7zq39/8x1xoqP0n6NeARy3z296b91Uf9+fUty5Jqpr+mshHAtsggi2uLoXgo/QSwHihw3rXB1EUhdz9WH8UcUTFdgiocQ+kjf78f1hx+g75LOI6/Hr/vzbBCXoQYQ/aWMHCuhK5UYiDpwo5NLvNouIPvKHevoaStmab09Ml9//W1+4eTu7HdXbC0IB5kfwE790yVvB7j+FAq6Iyh8w7eC7DoC5gkaaRepJAyNzhMOt6d95aqDmbyJGuJYLuEUjB8IX6mPChnDO+xK6EQTu1/3NABtFhPxqvsHvVtcA1Or19UK+qGPGkinbRYjfnzcu7vmDqzZ9gYbBo397QSmAw7np3S9fUZut/H4+k3sPQmbyEP4fF+DcvphKBSI0sY6Ov8erpRruSRpNHc/rxDwxNFfvzCBhXnaPFwDuLelSKOL9Ufy+BDQykpxbgugCkK52rgLQzBHxvT/0yISNe2Zyhd/+lb+7+btHv9j/3yt8wSnA/KV/4uoLX02P4W+yTsB5Lu0yQyrW3+FrdsUtrFIXICNXKaoxPeEgoZ3k0EWphX5/x8jMXjW6sIxLHx+/PmbYKdS7wQ4CSVQO4b7W5A4KpwLUsbwbfX47Mvn6T9QvXfWZqzf9/WFv256/34V6fsEqgAOyadOmfMPO774R5v6h0mz5PPmBOf3gCVhrI2SwiYe+X+QXAczoCfP6e9fw0yWMMElEyx8nIjB/4/5GG3IKO3ccJF1K1cfP1wryW1l+5tNtPas/+74//rxdTy/I7QWtAPMj7kJVn9x35wUkbt4Hc38N0qaIXyVzWroiNLEjB4gZynwmnFf/tnJXzRHkUAgF7We8DLjH4ENR7A0klpwp1DbcRUTx5Upz19f+619+dWD+Gl6ozz8XCvCTg/+Xv/TqVVOTY5eQBr6U98+C7PVo5ZI9GzgQewgeXQio97vYORqhlfu6ihT+VJ2ugxTzOBnFR/nkpnx96zd/9dPfeiBgwS/+HGw/dwrwkzIxhzAyNHgSs3NeDAKcTEFpNbC+CJxvRfp1MHt7Ql0JRpCYAgmGmbo+RJC5lzceZwbP/Q31DQ8M/u0tWzZlWMrz53D7uVaAfycvOkJvvPaamkP7hpvGhveTD87UFoulAlOxK/nGmtGaQvfImoYVkxcc5gmY/+46jr1xbASOjcCxETg2AsdG4NgIHBuBYyNwbASOjcCxETg2AsdG4NgIHBuBYyNwbASOjcCxEXheR+D/AVr8gKaAYTfNAAAAAElFTkSuQmCC",
    "data:image/png;base64,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",
  ];
  const clayPet =
    "data:image/png;base64,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";
  // Display-only projections of the existing archive. Missing facts stay missing.
  const statusGroups = [
    ["planning", "待办"],
    ["active", "进行中"],
    ["review", "验收中"],
    ["blocked", "已阻塞"],
    ["done", "已完成"],
  ];
  function phase(value) {
    if (["active", "in_progress", "running"].includes(value)) return "active";
    if (["review", "ready_for_review"].includes(value)) return "review";
    if (["done", "completed", "approved"].includes(value)) return "done";
    if (["blocked", "failed"].includes(value)) return "blocked";
    if (value === "cancelled") return "cancelled";
    return "planning";
  }
  const label = (value) =>
    statusGroups.find(([key]) => key === phase(value))?.[1] || "已取消";
  const tone = (value) =>
    ({
      active: "var(--blue-11)",
      blocked: "var(--text-danger)",
      review: "var(--text-warning)",
    })[phase(value)] || "var(--text-subtle)";
  const companyOf = (task) => task.company || task.team || "公司未登记";
  const projectOf = (task) => task.projectId || task.project || "项目未登记";
  const stepsOf = (task) =>
    Array.isArray(task.steps)
      ? task.steps
      : Array.isArray(task.milestones)
        ? task.milestones
        : [];
  const execution = (task) => {
    const values = [
      task.lastExecutedAt,
      task.executedAt,
      ...stepsOf(task).map((step) => step.lastExecutedAt || step.executedAt),
    ];
    return (
      values
        .filter(
          (v) =>
            typeof v === "string" &&
            /^\d{4}-\d\d-\d\dT/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            Date.parse(v) <= Date.now(),
        )
        .sort()
        .at(-1) || null
    );
  };
  const dateText = (value) =>
    value
      ? new Date(value).toLocaleString("zh-CN", { hour12: false })
      : "未登记";
  const percent = (value) =>
    Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const card = {
    ...column,
    padding: "var(--space-5)",
    gap: "var(--space-4)",
    textAlign: "start",
    whiteSpace: "normal",
    height: "auto",
    alignItems: "stretch",
    flexShrink: 0,
    overflowWrap: "anywhere",
    background: "var(--surface-popover)",
    border: 0,
    borderRadius: "var(--radius-row)",
    boxShadow:
      "var(--shadow-sm), inset 0 1px 0 var(--rim-lit), inset 0 -1px 0 var(--rim-shade)",
  };
  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 17rem), 1fr))",
    alignItems: "start",
    gap: "var(--space-5)",
  };
  const heading = (value, level = "h2") =>
    h(
      level,
      { className: "text-body-lg", style: { margin: 0, fontWeight: 500 } },
      value,
    );
  function Signal({ status }) {
    return h(
      "span",
      { style: { ...row, gap: "var(--space-2)", color: tone(status) } },
      h("span", {
        "aria-hidden": true,
        style: {
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        },
      }),
      label(status),
    );
  }
  const clayCard = {
    ...card,
    borderRadius: "1.5rem",
    background:
      "linear-gradient(145deg, var(--surface-popover), var(--surface-inset))",
    border: "1px solid var(--border-standard)",
    borderTopColor: "var(--rim-lit)",
    boxShadow:
      "inset 0 1px 0 var(--rim-lit), 0 5px 0 var(--border-standard), var(--shadow-sm)",
  };
  const sizedGrid = (size) => ({
    ...grid,
    alignItems: "stretch",
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${size}), 1fr))`,
  });
  function Avatar({ name, small = false }) {
    const portrait =
      clayAvatars[{ 潘涛: 2, Steven: 0, 周阳: 4, 李浩: 3, 小卢: 1 }[name]];
    return h(
      "span",
      {
        "aria-hidden": true,
        title: name,
        style: {
          display: "inline-block",
          width: small ? "2rem" : "4.25rem",
          height: small ? "2rem" : "4.25rem",
          flexShrink: 0,
          borderRadius: "50%",
          overflow: "hidden",
          background: "var(--surface-inset)",
          boxShadow:
            "inset 0 2px 3px var(--rim-lit), 0 3px 0 var(--border-standard), var(--shadow-sm)",
        },
      },
      portrait
        ? h("img", {
            src: portrait,
            alt: "",
            draggable: false,
            style: {
              width: "125%",
              height: "125%",
              maxWidth: "none",
              objectFit: "contain",
              display: "block",
              transform: "translate(-10%, -10%)",
            },
          })
        : h(
            "span",
            {
              style: {
                display: "grid",
                placeItems: "center",
                height: "100%",
                fontSize: small ? "1rem" : "1.5rem",
              },
            },
            String(name || "未").slice(0, 1),
          ),
    );
  }
  function Ring({ done, total }) {
    return h(
      "svg",
      {
        viewBox: "0 0 100 100",
        width: 76,
        height: 76,
        role: "img",
        "aria-label": `${total}项中完成${done}项`,
        style: { flexShrink: 0 },
      },
      h("circle", {
        cx: 50,
        cy: 50,
        r: 40,
        fill: "none",
        stroke: "var(--border-standard)",
        strokeWidth: 7,
      }),
      h("circle", {
        cx: 50,
        cy: 50,
        r: 40,
        fill: "none",
        stroke: "var(--text-standard)",
        strokeWidth: 7,
        strokeDasharray: 251.33,
        strokeDashoffset: total ? 251.33 * (1 - done / total) : 251.33,
        transform: "rotate(-90 50 50)",
      }),
    );
  }
  function Choices({ name, value, values, onChange }) {
    return h(
      "div",
      { role: "group", "aria-label": name, style: row },
      values.map(([key, title]) =>
        button(title, () => onChange(key), {
          key,
          "aria-pressed": value === key,
        }),
      ),
    );
  }
  function Pet({ open, setOpen, parent }) {
    const [position, setPosition] = React.useState({ x: 1, y: 1 });
    const drag = React.useRef(null),
      suppress = React.useRef(false);
    function finish(event, cancel = false) {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      drag.current = null;
      suppress.current = active.moved;
      if (cancel) setPosition(active.start);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    return h(
      "button",
      {
        type: "button",
        "aria-label": open ? "收起助手" : "打开助手",
        "aria-expanded": open,
        title: "拖动移动，Alt＋方向键移动，点击打开助手",
        style: {
          position: "absolute",
          zIndex: 3,
          left: `calc(${position.x * 100}% - ${position.x * 88}px)`,
          top: `calc(${position.y * 100}% - ${position.y * 88}px)`,
          width: 88,
          height: 88,
          padding: "var(--space-1)",
          border: 0,
          background: "transparent",
          touchAction: "none",
          cursor: "grab",
        },
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          const bounds = parent.current.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            start: position,
            width: Math.max(1, bounds.width - 88),
            height: Math.max(1, bounds.height - 88),
            moved: false,
          };
          suppress.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e) => {
          const active = drag.current;
          if (!active || active.id !== e.pointerId) return;
          const dx = e.clientX - active.x,
            dy = e.clientY - active.y;
          if (Math.hypot(dx, dy) > 5) active.moved = true;
          if (active.moved)
            setPosition({
              x: Math.max(0, Math.min(1, active.start.x + dx / active.width)),
              y: Math.max(0, Math.min(1, active.start.y + dy / active.height)),
            });
        },
        onPointerUp: (e) => finish(e),
        onPointerCancel: (e) => finish(e, true),
        onLostPointerCapture: (e) => finish(e, true),
        onClick: () => {
          if (suppress.current) {
            suppress.current = false;
            return;
          }
          setOpen(!open);
        },
        onKeyDown: (e) => {
          const direction = {
            ArrowLeft: [-0.05, 0],
            ArrowRight: [0.05, 0],
            ArrowUp: [0, -0.05],
            ArrowDown: [0, 0.05],
          }[e.key];
          if (!e.altKey || !direction) return;
          e.preventDefault();
          setPosition((p) => ({
            x: Math.max(0, Math.min(1, p.x + direction[0])),
            y: Math.max(0, Math.min(1, p.y + direction[1])),
          }));
        },
      },
      h("img", {
        src: clayPet,
        alt: "",
        draggable: false,
        style: {
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
        },
      }),
    );
  }
  let bridge;
  function Workspace({ connection, panel = false }) {
    const roster = React.useSyncExternalStore(
      connection.session.channels.subscribeList,
      connection.session.channels.list,
      connection.session.channels.list,
    );
    const sourceMember = roster.channels.find((c) => c.id === sourceChannel);
    const sourceAllowed =
      roster.status === "ready" &&
      sourceMember &&
      !sourceMember.archived &&
      !sourceMember.cached &&
      !sourceMember.metadataPending &&
      sourceMember.members?.includes(connection.session.viewer);
    React.useEffect(() => {
      connection.session.channels.ensureList();
    }, [connection.session]);
    const [state, setState] = React.useState({ loading: true });
    const [refresh, setRefresh] = React.useState(0);
    const [selected, select] = React.useState(""),
      [project, selectProject] = React.useState("");
    const [period, setPeriod] = React.useState(7),
      [milestoneCompany, setMilestoneCompany] = React.useState("");
    const [view, setView] = React.useState("list"),
      [overview, setOverview] = React.useState("board");
    const [focusId, setFocusId] = React.useState("");
    const [team, setTeam] = React.useState(""),
      [person, setPerson] = React.useState("");
    const [chat, showChat] = React.useState(false),
      [compact, setCompact] = React.useState(false);
    const listScroll = React.useRef(0);
    const root = React.useRef(null),
      listRef = React.useRef(null),
      backRef = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(([e]) =>
        setCompact(e.contentRect.width < 820),
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, [sourceAllowed]);
    const owner = React.useMemo(
      () => ({
        connection,
        channel: "",
        linkVersion: 0,
        selected: "",
        focus: (id, data) => {
          setState({ data, loading: false });
          select(id);
        },
      }),
      [connection.session, connection.scope, connection.generation],
    );
    const onChannel = React.useCallback(
      (id) => {
        if (owner.channel !== id) owner.linkVersion++;
        owner.channel = id;
      },
      [owner],
    );
    owner.selected = selected;
    React.useEffect(() => {
      if (panel) return;
      bridge = owner;
      return () => {
        if (bridge === owner) bridge = undefined;
      };
    }, [owner, panel]);
    React.useEffect(() => {
      if (!sourceAllowed) {
        setState({ loading: false });
        return;
      }
      let active = true;
      setState((p) => ({ ...p, loading: true, error: "" }));
      read(connection).then(
        (data) => {
          if (active) setState({ data, loading: false });
        },
        (error) => {
          if (active)
            setState((p) => ({ ...p, loading: false, error: error.message }));
        },
      );
      return () => {
        active = false;
      };
    }, [
      connection.session,
      connection.generation,
      connection.scope,
      refresh,
      sourceAllowed,
    ]);
    const tasks = state.data?.tasks || [],
      chosen = tasks.find((t) => t.id === selected);
    const projects = [...new Set(tasks.map(projectOf))];
    const projectTasks = tasks.filter(
      (t) =>
        (!project || projectOf(t) === project) &&
        (!person || t.assignee === person) &&
        (!team || companyOf(t) === team),
    );
    const companyNames = [...new Set(tasks.map(companyOf))];
    const context = chosen
      ? `当前任务 ${chosen.id} · 频道基线`
      : "可读取同一份频道工作基线，不写业务进度。";
    const reload = () => setRefresh((r) => r + 1);
    function closeDetail() {
      const id = selected;
      select("");
      requestAnimationFrame(() => {
        if (!listRef.current) return;
        listRef.current.scrollTop = listScroll.current;
        [...listRef.current.querySelectorAll("[data-task-id]")]
          .find((node) => node.dataset.taskId === id)
          ?.focus({ preventScroll: true });
      });
    }
    function picker(name, value, set, values) {
      return h(
        "label",
        { style: row },
        name,
        h(
          "select",
          {
            "aria-label": name,
            value,
            onChange: (e) => set(e.target.value),
            style: { maxWidth: "100%" },
          },
          h("option", { value: "" }, `全部${name}`),
          values.map((v) => h("option", { key: v, value: v }, v)),
        ),
      );
    }
    function sourceDetails() {
      return h(
        "details",
        { style: { ...inset, flexShrink: 0 } },
        h("summary", null, "来源与同步"),
        h(
          "p",
          { style: { overflowWrap: "anywhere" } },
          `${source} · ${state.data?.baselineRevision?.slice(0, 12) || "未读取"} · ${text(state.data?.syncedAt)}`,
        ),
        h(
          "p",
          null,
          "旧任务和旧完成数已退出；此页按频道分工从零登记，尚未接通实际执行进度。",
        ),
        button("重新读取", reload, { disabled: state.loading }),
      );
    }
    function steps(task) {
      const values = stepsOf(task);
      return values.length
        ? h(
            "ol",
            {
              "aria-label": "任务步骤",
              style: {
                ...column,
                gap: "var(--space-4)",
                padding: 0,
                margin: 0,
                listStyle: "none",
              },
            },
            values.map((step, i) =>
              h(
                "li",
                {
                  key: step.id || i,
                  style: {
                    ...row,
                    alignItems: "start",
                    flexWrap: "nowrap",
                    color: tone(step.status),
                  },
                },
                h(
                  "span",
                  {
                    style: {
                      border: "1px solid currentColor",
                      borderRadius: "50%",
                      minWidth: "1.75rem",
                      height: "1.75rem",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    },
                  },
                  phase(step.status) === "done" ? "✓" : i + 1,
                ),
                h(
                  "div",
                  { style: column },
                  h(
                    "strong",
                    { style: { fontWeight: 500, overflowWrap: "anywhere" } },
                    text(step.name || step.title),
                  ),
                  h(Signal, { status: step.status }),
                ),
              ),
            ),
          )
        : h("p", { role: "status" }, "任务步骤尚未登记");
    }
    function taskCard(task, expanded = false) {
      const values = stepsOf(task),
        done = values.filter((s) => phase(s.status) === "done").length;
      return h(
        "div",
        {
          key: task.id,
          className: "ui-card",
          style: { ...card, padding: "var(--space-4)" },
        },
        button(
          h(
            React.Fragment,
            null,
            h(
              "strong",
              {
                className: "text-body-lg",
                style: {
                  display: "block",
                  textAlign: "start",
                  whiteSpace: "normal",
                },
              },
              task.title,
            ),
            h(
              "span",
              {
                style: {
                  ...row,
                  marginTop: "var(--space-3)",
                  justifyContent: "space-between",
                },
              },
              h(Signal, { status: task.status }),
              values.length
                ? `${done} / ${values.length} 任务完成`
                : "步骤未登记",
            ),
          ),
          () => select(task.id),
          {
            "aria-label": `查看任务 ${task.title}`,
            "data-task-id": task.id,
            style: {
              height: "auto",
              whiteSpace: "normal",
              textAlign: "start",
              width: "100%",
            },
          },
        ),
        expanded
          ? steps(task)
          : h("details", null, h("summary", null, "任务进度"), steps(task)),
      );
    }
    function taskViews() {
      const sorted = [...projectTasks].sort((a, b) =>
        (execution(b) || "").localeCompare(execution(a) || ""),
      );
      return h(
        React.Fragment,
        null,
        h(
          "div",
          { style: { ...row, marginBottom: "var(--space-4)" } },
          picker(
            "项目",
            project,
            (value) => {
              selectProject(value);
              if (!value) setOverview("tasks");
            },
            projects,
          ),
          picker("负责人", person, setPerson, [
            ...new Set(tasks.map((t) => t.assignee || "未分配")),
          ]),
          button("清空筛选", () => {
            selectProject("");
            setOverview("tasks");
            setPerson("");
            setTeam("");
          }),
        ),
        h(Choices, {
          name: "任务视图",
          value: view,
          onChange: setView,
          values: [
            ["list", "清单"],
            ["focus", "聚焦一件事"],
            ["status", "状态分组"],
            ["time", "执行时间"],
          ],
        }),
        h(
          "div",
          {
            style: {
              ...column,
              gap: "var(--space-4)",
              marginTop: "var(--space-5)",
            },
          },
          !projectTasks.length && h("p", { role: "status" }, "没有匹配任务"),
          view === "focus"
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { role: "group", "aria-label": "聚焦任务", style: row },
                  projectTasks.map((t, i) =>
                    button(i + 1, () => setFocusId(t.id), {
                      key: t.id,
                      "aria-label": `聚焦 ${t.title}`,
                      "aria-pressed": (focusId || projectTasks[0]?.id) === t.id,
                    }),
                  ),
                ),
                projectTasks.length > 0 &&
                  taskCard(
                    projectTasks.find((t) => t.id === focusId) ||
                      projectTasks[0],
                    true,
                  ),
              )
            : view === "status"
              ? statusGroups.map(([key, title]) => {
                  const items = projectTasks.filter(
                    (t) => phase(t.status) === key,
                  );
                  return h(
                    "section",
                    { key, style: { ...column, gap: "var(--space-3)" } },
                    heading(`${title} ${items.length}`, "h3"),
                    items.map((t) => taskCard(t)),
                  );
                })
              : view === "time"
                ? h(
                    React.Fragment,
                    null,
                    sorted
                      .filter(execution)
                      .map((t) =>
                        h(
                          "section",
                          { key: t.id },
                          h("p", null, dateText(execution(t))),
                          taskCard(t),
                        ),
                      ),
                    heading("执行时间未登记", "h3"),
                    sorted.filter((t) => !execution(t)).map((t) => taskCard(t)),
                  )
                : projectTasks.map((t) => taskCard(t)),
        ),
      );
    }
    function projectCard(name) {
      const items = tasks.filter((t) => projectOf(t) === name),
        done = items.filter((t) => phase(t.status) === "done").length;
      return button(
        h(
          React.Fragment,
          null,
          h(
            "strong",
            {
              className: "text-heading",
              style: { fontSize: "1.125rem", lineHeight: 1.6, fontWeight: 600 },
            },
            text(items[0]?.project || name),
          ),
          h(
            "span",
            {
              className: "text-body-lg",
              style: { color: "var(--text-subtle)", fontSize: "1rem" },
            },
            `${done} / ${items.length} 任务完成`,
          ),
          h(
            "span",
            {
              style: {
                ...row,
                gap: ".35rem",
                marginTop: ".85rem",
                color: "var(--text-subtle)",
                fontSize: "1rem",
              },
            },
            [
              companyOf(items[0]),
              ...new Set(items.map((t) => t.assignee || "未分配")),
            ].map((name) =>
              h(
                "span",
                {
                  key: name,
                  style: {
                    borderRadius: "var(--radius-pill)",
                    padding: ".25rem .7rem",
                    background: "var(--affordance-subtle)",
                  },
                },
                name,
              ),
            ),
          ),
        ),
        () => {
          selectProject(name);
          setView("list");
        },
        {
          key: name,
          className: "ui-card",
          "aria-label": `查看项目 ${text(items[0]?.project || name)}`,
          style: { ...card, width: "100%", minHeight: "10rem", gap: "1.25rem" },
        },
      );
    }
    function projectOverview() {
      const names = projects.filter((p) =>
        tasks.some(
          (t) => projectOf(t) === p && (!team || companyOf(t) === team),
        ),
      );
      const stateFor = (name) => {
        const items = tasks.filter((t) => projectOf(t) === name);
        return (
          ["blocked", "active", "review", "planning", "done"].find((s) =>
            items.some((t) => phase(t.status) === s),
          ) || "planning"
        );
      };
      return h(
        React.Fragment,
        null,
        h(
          "div",
          { style: { ...row, marginBottom: "var(--space-5)" } },
          picker("团队", team, setTeam, companyNames),
          h(Choices, {
            name: "项目视图",
            value: overview,
            onChange: setOverview,
            values: [
              ["list", "列表"],
              ["board", "看板"],
            ],
          }),
          button("全部任务", () => {
            selectProject("");
            setOverview("tasks");
          }),
        ),
        overview === "tasks"
          ? taskViews()
          : overview === "list"
            ? h("div", { style: grid }, names.map(projectCard))
            : h(
                "div",
                {
                  "aria-label": "项目状态看板",
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(14rem, 1fr))",
                    minHeight: "calc(100dvh - 16rem)",
                    gap: "var(--space-4)",
                    overflowX: "auto",
                    alignItems: "stretch",
                    paddingBottom: "var(--space-3)",
                  },
                },
                statusGroups.map(([key]) => {
                  const values = names.filter((p) => stateFor(p) === key);
                  return h(
                    "section",
                    {
                      key,
                      style: {
                        ...column,
                        flex: "1 0 13rem",
                        gap: "var(--space-4)",
                        padding: "var(--space-4)",
                        background: "var(--surface-inset)",
                        borderRadius: "var(--radius-container)",
                      },
                    },
                    h(
                      "div",
                      { style: { ...row, justifyContent: "space-between" } },
                      h(Signal, { status: key }),
                      h(
                        "span",
                        { style: { color: "var(--text-subtle)" } },
                        values.length,
                      ),
                    ),
                    values.map(projectCard),
                  );
                }),
              ),
      );
    }
    function companyOverview() {
      const recent = tasks.filter(
        (t) =>
          !execution(t) ||
          Date.now() - Date.parse(execution(t)) < period * 86400000,
      );
      const undated = tasks.filter((t) => !execution(t));
      const rank = (a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (a.manualRank ?? 100) - (b.manualRank ?? 100) ||
        (a.priorityCode || "P3").localeCompare(b.priorityCode || "P3");
      const people = [...new Set(tasks.map((t) => t.assignee || "未分配"))];
      const milestones = Array.isArray(state.data?.companyMilestones)
        ? state.data.companyMilestones
        : [];
      const selectedCompany = milestoneCompany || companyNames[0];
      return h(
        "div",
        { style: { ...column, gap: "var(--space-8)" } },
        h(
          "section",
          {
            "aria-label": "每个人的第一件事",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("每个人的第一件事"),
            h("span", null, `${people.length} 人`),
          ),
          h(
            "div",
            { style: sizedGrid("13rem") },
            people.map((name) => {
              const own = tasks
                .filter(
                  (t) =>
                    (t.assignee || "未分配") === name &&
                    !["done", "cancelled"].includes(phase(t.status)),
                )
                .sort(rank);
              const first =
                own.find((t) => phase(t.status) === "active") || own[0];
              return button(
                h(
                  React.Fragment,
                  null,
                  h(
                    "span",
                    { style: row },
                    h(Avatar, { name }),
                    h("strong", null, name),
                  ),
                  h(
                    "strong",
                    {
                      className: "text-heading",
                      style: {
                        minHeight: "3.75rem",
                        fontSize: "1.25rem",
                        lineHeight: 1.5,
                        fontWeight: 500,
                      },
                    },
                    first?.title || "暂无待办",
                  ),
                  first &&
                    h(
                      "span",
                      {
                        style: {
                          ...row,
                          justifyContent: "space-between",
                          marginTop: "auto",
                        },
                      },
                      h("span", null, first.project),
                      h(Signal, { status: first.status }),
                    ),
                ),
                () => first && select(first.id),
                {
                  key: name,
                  className: "ui-card",
                  "aria-label": `${name}的首要任务`,
                  "data-task-id": first?.id,
                  disabled: !first,
                  style: {
                    ...clayCard,
                    height: "100%",
                    gap: "1.125rem",
                    minHeight: "14.75rem",
                    width: "100%",
                  },
                },
              );
            }),
          ),
        ),
        h(
          "section",
          {
            "aria-label": "公司进度",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("公司进度"),
            h(Choices, {
              name: "执行周期",
              value: period,
              onChange: setPeriod,
              values: [
                [1, "1 天"],
                [7, "7 天"],
                [30, "30 天"],
              ],
            }),
          ),
          h(
            "div",
            { style: sizedGrid("20rem") },
            companyNames.map((name) => {
              const items = recent.filter((t) => companyOf(t) === name),
                done = items.filter((t) => phase(t.status) === "done").length;
              const all = tasks.filter((t) => companyOf(t) === name);
              return h(
                "article",
                {
                  key: name,
                  className: "ui-card",
                  style: {
                    ...clayCard,
                    minHeight: items.length ? "23rem" : "12rem",
                  },
                },
                h(
                  "div",
                  { style: row },
                  h(
                    "span",
                    {
                      "aria-hidden": true,
                      style: {
                        display: "grid",
                        placeItems: "center",
                        width: "2.75rem",
                        height: "2.75rem",
                        borderRadius: "1rem",
                        background: "var(--surface-inset)",
                        boxShadow:
                          "inset 0 1px 0 var(--rim-lit), 0 3px 0 var(--border-standard)",
                      },
                    },
                    name === "公司未登记" ? "—" : name.slice(0, 1),
                  ),
                  heading(name, "h3"),
                ),
                h(
                  "div",
                  { style: { ...row, justifyContent: "space-between" } },
                  h(
                    "span",
                    { style: column },
                    h(
                      "strong",
                      {
                        className: "text-title",
                        style: {
                          fontSize: "2.75rem",
                          lineHeight: 1.1,
                          fontWeight: 500,
                        },
                      },
                      done,
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "1.25rem",
                            color: "var(--text-subtle)",
                          },
                        },
                        ` / ${items.length}`,
                      ),
                    ),
                    h("span", null, "基线分工已完成"),
                  ),
                  h(Ring, { done, total: items.length }),
                ),
                items.length > 0 &&
                  h(
                    "div",
                    { style: row },
                    ["active", "blocked"].map((status) =>
                      h(
                        "span",
                        { key: status, style: row },
                        h(Signal, { status }),
                        items.filter((t) => phase(t.status) === status).length,
                      ),
                    ),
                  ),
                items.slice(0, 3).map((t) =>
                  button(
                    h(
                      React.Fragment,
                      null,
                      h(Avatar, {
                        name: t.assignee,
                        small: true,
                      }),
                      t.title,
                    ),
                    () => select(t.id),
                    {
                      key: t.id,
                      style: {
                        height: "auto",
                        whiteSpace: "normal",
                        textAlign: "start",
                      },
                    },
                  ),
                ),
                !items.length &&
                  h(
                    "p",
                    { role: "status", style: { margin: 0 } },
                    "当前周期没有已登记执行记录",
                  ),
                button(
                  h(
                    React.Fragment,
                    null,
                    `全部 ${all.length} 项`,
                    h("span", { "aria-hidden": true }, "→"),
                  ),
                  () => {
                    setTeam(name);
                    setOverview("tasks");
                    setPerson("");
                    selectProject("");
                  },
                  {
                    style: {
                      ...row,
                      justifyContent: "space-between",
                      marginTop: "auto",
                      border: 0,
                      borderTop: "1px solid var(--border-standard)",
                      borderRadius: 0,
                      padding: "1rem 0 0",
                      background: "transparent",
                      width: "100%",
                    },
                  },
                ),
              );
            }),
          ),
          undated.length > 0 &&
            h(
              "details",
              null,
              h("summary", null, `执行时间未登记 · ${undated.length} 项`),
              h(
                "div",
                { style: { ...grid, marginTop: "var(--space-4)" } },
                undated.map((t) => taskCard(t)),
              ),
            ),
        ),
        h(
          "section",
          {
            "aria-label": "公司里程碑",
            style: { ...column, gap: "var(--space-5)" },
          },
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("公司里程碑"),
            h(Choices, {
              name: "里程碑公司",
              value: selectedCompany,
              onChange: setMilestoneCompany,
              values: companyNames.map((n) => [n, n]),
            }),
          ),
          h(
            "div",
            { style: sizedGrid("16rem") },
            milestones
              .filter((m) => m.company === selectedCompany)
              .map((m, i) =>
                h(
                  "article",
                  { key: m.id || i, className: "ui-card", style: clayCard },
                  h("span", null, text(m.targetDate)),
                  heading(m.title, "h3"),
                  h(Signal, { status: m.status }),
                ),
              ),
          ),
          !milestones.some((m) => m.company === selectedCompany) &&
            h(
              "div",
              {
                role: "status",
                style: {
                  ...clayCard,
                  minHeight: "10rem",
                  justifyContent: "center",
                  alignItems: "center",
                  color: "var(--text-subtle)",
                },
              },
              "公司里程碑尚未登记",
            ),
        ),
      );
    }
    function detail() {
      const values = stepsOf(chosen),
        done = values.filter((s) => phase(s.status) === "done").length;
      const progress = values.length
        ? (done / values.length) * 100
        : percent(chosen.progress);
      return h(
        "article",
        {
          "aria-label": "任务详情",
          style: {
            ...column,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            lineHeight: 1.6,
          },
        },
        h(
          "div",
          {
            style: {
              ...column,
              paddingBlock: "var(--space-5)",
              gap: "var(--space-4)",
              overflow: "auto",
              flex: "0 0 auto",
              width: "calc(100% - 2rem)",
              maxWidth: "44rem",
              alignSelf: "center",
            },
          },
          h(
            "div",
            { style: row },
            button("关闭任务详情", closeDetail, { ref: backRef }),
            h("span", null, chosen.project),
          ),
          h(
            "h2",
            {
              className: "text-heading",
              style: { margin: 0, lineHeight: 1.6, fontWeight: 600 },
            },
            chosen.title,
          ),
          h(Signal, { status: chosen.status }),
          h(
            "div",
            { style: { ...row, justifyContent: "space-between" } },
            heading("任务进度", "h3"),
            h(
              "span",
              null,
              values.length
                ? `${done} / ${values.length} 任务完成`
                : "步骤未登记",
            ),
          ),
          progress !== null &&
            h(
              "div",
              {
                role: "progressbar",
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": progress,
                "aria-label": "任务完成进度",
                style: {
                  height: ".5rem",
                  width: "100%",
                  overflow: "hidden",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-inset)",
                },
              },
              h("div", {
                style: {
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--blue-11)",
                },
              }),
            ),
          steps(chosen),
          h("p", null, `最近执行 · ${dateText(execution(chosen))}`),
          h(
            "details",
            null,
            h("summary", null, "任务资料"),
            h("p", null, `${chosen.assignee || "未分配"} · ${chosen.id}`),
            h("h3", null, "完成定义"),
            h(
              "p",
              { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } },
              chosen.completionDefinition || "未登记",
            ),
          ),
        ),
        !panel &&
          !company &&
          h(
            "div",
            {
              "aria-label": "任务对话",
              style: {
                ...column,
                width: "100%",
                maxWidth: "52rem",
                alignSelf: "center",
                flex: "0 0 auto",
                height: "clamp(30rem, 60vh, 48rem)",
                paddingTop: "2rem",
                background:
                  "linear-gradient(to bottom, transparent, var(--surface-panel))",
              },
            },
            h(Assistant, {
              key: chosen.id,
              connection,
              context: `${context} · 选择该任务的私人对话`,
              visible: true,
              onChannel,
            }),
          ),
        company &&
          button("打开助手讨论此任务", () => showChat(true), {
            style: { alignSelf: "start", margin: "var(--space-4)" },
          }),
      );
    }
    if (!sourceAllowed)
      return h(
        "p",
        { role: "alert", style: inset },
        "当前账号尚不能读取工作基线频道，请检查成员权限。",
      );
    return h(
      "div",
      {
        ref: root,
        style: {
          ...column,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          fontSize: "var(--text-label)",
          lineHeight: "var(--text-label--line-height)",
          color: "var(--text-standard)",
        },
      },
      !panel &&
        h(
          "header",
          {
            style: {
              ...row,
              ...inset,
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)",
            },
          },
          h(
            "h1",
            { className: "text-label", style: { margin: 0, flex: 1 } },
            title,
          ),
          !company &&
            !chosen &&
            button(chat ? "收起助手" : "打开助手", () => showChat(!chat), {
              "aria-expanded": chat,
            }),
        ),
      h(
        "div",
        { role: "status", style: { ...row, ...inset, flexShrink: 0 } },
        state.loading ? "正在读取任务…" : `频道基线 · ${tasks.length} 项`,
        state.data &&
          h(
            "span",
            null,
            `来源更新 ${String(state.data.syncedAt || "未登记").slice(0, 10)}`,
          ),
        state.error &&
          h(
            "div",
            { role: "alert" },
            state.error,
            "；保留上次结果 ",
            button("重试", reload),
          ),
      ),
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            style: {
              ...column,
              flex: 1,
              display:
                compact && chat && (company || !chosen) ? "none" : "flex",
            },
          },
          chosen
            ? detail()
            : h(
                "div",
                {
                  ref: listRef,
                  "aria-label": "任务列表",
                  onScroll: (event) => {
                    listScroll.current = event.currentTarget.scrollTop;
                  },
                  style: { ...inset, flex: 1, overflow: "auto", minWidth: 0 },
                },
                project &&
                  h(
                    "div",
                    { style: { ...row, marginBottom: "var(--space-5)" } },
                    button("全部项目", () => {
                      selectProject("");
                      setOverview("board");
                    }),
                    heading(String(project)),
                  ),
                company &&
                  !panel &&
                  overview === "tasks" &&
                  button("返回公司看板", () => {
                    setOverview("board");
                    setTeam("");
                    selectProject("");
                  }),
                state.data &&
                  (!company || panel || overview === "tasks" || project
                    ? panel || project || overview === "tasks"
                      ? taskViews()
                      : projectOverview()
                    : companyOverview()),
                !state.loading &&
                  !tasks.length &&
                  h("p", { role: "status" }, "当前基线没有任务"),
              ),
          sourceDetails(),
        ),
        chat &&
          !panel &&
          (company || !chosen) &&
          h(
            "aside",
            {
              "aria-label": "工作助手",
              onKeyDown: (event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                  event.stopPropagation();
                  showChat(false);
                  root.current
                    ?.querySelector('button[title^="拖动移动"]')
                    ?.focus();
                }
              },
              style: {
                ...column,
                width: compact ? "100%" : "min(44%, 30rem)",
                ...(company && !compact
                  ? {
                      position: "absolute",
                      zIndex: 2,
                      insetInlineEnd: "var(--space-4)",
                      bottom: "6rem",
                      width: "min(44%, 30rem)",
                      height: "min(75%, 40rem)",
                      borderRadius: "var(--radius-container)",
                      boxShadow: "var(--elevation-popover)",
                    }
                  : {}),
                flexShrink: 0,
                background:
                  "linear-gradient(to bottom, transparent, var(--surface-panel))",
              },
            },
            button("收起助手", () => showChat(false), {
              "aria-label": "关闭工作助手",
            }),
            h(Assistant, { connection, context, visible: true, onChannel }),
          ),
      ),
      company &&
        !panel &&
        h(Pet, { open: chat, setOpen: showChat, parent: root }),
    );
  }
  function Page({ panel = false } = {}) {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope],
    );
    const previous = React.useRef();
    const sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer
      ? h(Workspace, {
          key: sequence.current,
          connection,
          panel,
        })
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可读取任务。",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbGF5b3V0LWRhc2hib2FyZCIKPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmMWY0ZjgiIHN0cm9rZT0ibm9uZSIvPgogIDxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIgLz4KICA8cGF0aCBkPSJNNSA0aDRhMSAxIDAgMCAxIDEgMXY2YTEgMSAwIDAgMSAtMSAxaC00YTEgMSAwIDAgMSAtMSAtMXYtNmExIDEgMCAwIDEgMSAtMSIgLz4KICA8cGF0aCBkPSJNNSAxNmg0YTEgMSAwIDAgMSAxIDF2MmExIDEgMCAwIDEgLTEgMWgtNGExIDEgMCAwIDEgLTEgLTF2LTJhMSAxIDAgMCAxIDEgLTEiIC8+CiAgPHBhdGggZD0iTTE1IDEyaDRhMSAxIDAgMCAxIDEgMXY2YTEgMSAwIDAgMSAtMSAxaC00YTEgMSAwIDAgMSAtMSAtMXYtNmExIDEgMCAwIDEgMSAtMSIgLz4KICA8cGF0aCBkPSJNMTUgNGg0YTEgMSAwIDAgMSAxIDF2MmExIDEgMCAwIDEgLTEgMWgtNGExIDEgMCAwIDEgLTEgLTF2LTJhMSAxIDAgMCAxIDEgLTEiIC8+Cjwvc3ZnPg==",
    id: "main",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });

  ctx.agents.addTool({
    name: company ? "opcb_company_board_task" : "opcb_task_center_task",
    description:
      "读取或定位当前关联私人 Solo 的基线任务。省略 task_id 读取当前选择；focus 只改变页面选中项，不写任务。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        action: { type: "string", enum: ["read", "focus"] },
      },
      additionalProperties: false,
    },
    async call(client, context, args) {
      const owner = bridge;
      const expectedLink = owner?.linkVersion;
      const expectedSelection = owner?.selected;
      const authorize = () => {
        if (
          !owner ||
          bridge !== owner ||
          owner.linkVersion !== expectedLink ||
          owner.selected !== expectedSelection ||
          !owner.channel ||
          owner.channel !== context.channel
        )
          throw new Error("请先在页面关联本私人 Solo。");
        check(owner.connection);
        const agentConnection = ctx.agents.relay(client.key)?.snapshot();
        const roster = owner.connection.session.channels.list();
        const c = roster.channels.find((c) => c.id === context.channel);
        if (
          client.owner !== owner.connection.session.viewer ||
          agentConnection?.status !== "ready" ||
          agentConnection.cached ||
          agentConnection.scope !== owner.connection.scope ||
          roster.status !== "ready" ||
          !c ||
          c.channelType !== "solo" ||
          !c.private ||
          c.creator !== client.owner ||
          c.archived ||
          c.cached ||
          c.pending ||
          c.readOnly ||
          c.metadataPending ||
          c.members?.length !== 2 ||
          !c.members.includes(client.owner) ||
          !c.members.includes(client.pubkey)
        )
          throw new Error("当前私人 Solo 权限已变化。");
      };
      authorize();
      if (![undefined, "read", "focus"].includes(args.action))
        throw new Error("操作不受支持。");
      const id = args.task_id || owner.selected;
      if (!id) throw new Error("先选择任务或提供 task_id。");
      const data = await read(owner.connection);
      authorize();
      const task = data.tasks.find((t) => t.id === id);
      if (!task) throw new Error("该任务不在当前基线中，请刷新列表。");
      if (args.action === "focus") owner.focus(id, data);
      return JSON.stringify({
        source,
        projection: "channel_baseline",
        baselineRevision: data.baselineRevision,
        syncedAt: data.syncedAt,
        task,
      });
    },
  });
}
