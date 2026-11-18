// Reused from OPCB chat-artifacts (2026-11-13), extraction only.
import {safeUrl} from "./model.mjs";
export function categoryOf(file) {
	const name = file.name || "", mime = (file.mime || "").toLowerCase();
	if (file.kind === "image" || /^image\//.test(mime) || /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(name)) return "image";
	if (file.kind === "video" || /^video\//.test(mime) || /\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
	return /\.(md|markdown|txt|pdf|docx?|xlsx?|csv|pptx?|json|[cm]?[jt]sx?|py|rs|html?|css|ya?ml|sh|go|java|sql)$/i.test(name) || /^(text\/|application\/(pdf|json))/.test(mime) ? "document" : "other";
}

export function matchesArtifact(entry, query, profiles = new Map()) {
	const author = profiles.get(entry.message.authorId);
	const text = [entry.name, entry.url, entry.message.content, author?.name, author?.displayName].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
	return query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).every(word => text.includes(word));
}

// Links in examples are not deliverables. Rendering never interprets raw HTML.
export function linksIn(text) {
	if (typeof text !== "string" || text.length > 65536) return [];
	let fence;
	const lines = [];
	for (const line of text.split("\n")) {
		const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
		if (mark) {
			if (!fence) fence = mark;
			else if (mark[0] === fence[0] && mark.length >= fence.length)
				fence = undefined;
			continue;
		}
		if (!fence) lines.push(line);
	}
	let body = lines
		.join("\n")
		.replace(/(`+)[\s\S]*?\1/g, "")
		.replace(/<(https?:\/\/[^<>\s]+)>/g, "$1")
		.replace(/<[^>]*>/g, "");
	const result = [];
	body = body.replace(
		/!?\[([^\]\n]*)\]\((https?:\/\/[^\s]+?)(?:\s+"[^"]*")?\)/g,
		(_all, name, url) => {
			result.push({ url, name });
			return "";
		},
	);
	for (const match of body.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
		result.push({ url: match[0].replace(/[.,;!?，。；！）)\]}]+$/, "") });
	}
	return result;
}

export function artifactsFrom(rows, profiles = new Map()) {
	const entries = [];
	for (const row of rows) {
		const seen = new Set();
		const add = (raw, name, attachment) => {
			const url = safeUrl(raw);
			if (!url || seen.has(url)) return;
			seen.add(url);
			const parsed = new URL(url);
			let filename = parsed.pathname.split("/").at(-1);
			try {
				filename = decodeURIComponent(filename);
			} catch {
				/* preserve filename */
			}
			entries.push({
				id: `${row.id}:${url}`,
				url,
				name: name?.trim() || filename || parsed.hostname,
				category: attachment
					? categoryOf(attachment)
					: categoryOf({ name: filename }) !== "other" && !/\.html?$/i.test(parsed.pathname)
						? categoryOf({ name: filename })
					: parsed.pathname === "/" || /\.html?$/i.test(parsed.pathname)
						? "website"
						: "link",
				attachment,
				message: row,
				agent: !!row.agentEnvelope || !!profiles.get(row.authorId)?.isAgent,
			});
		};
		for (const attachment of row.attachments ?? [])
			add(attachment.url, attachment.name, attachment);
		for (const link of linksIn(row.content)) add(link.url, link.name);
	}
	return entries;
}

