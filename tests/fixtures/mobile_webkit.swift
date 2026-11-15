import AppKit
import WebKit

class Probe: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var decisions: [[String: Any]] = []
    var diagnostics: [String] = []
    func webView(_ view: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        let allowed = url?.scheme == "http" || url?.scheme == "https"
        decisions.append(["url": url?.absoluteString ?? "", "allowed": allowed, "main": action.targetFrame?.isMainFrame ?? false])
        decisionHandler(allowed ? .allow : .cancel)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let value = message.body as? String { diagnostics.append(String(value.prefix(500))) }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let probe = Probe()
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.userContentController.add(probe, name: "probe")
config.userContentController.addUserScript(WKUserScript(source: "window.addEventListener('error',e=>window.webkit.messageHandlers.probe.postMessage('error: '+e.message));window.addEventListener('message',e=>{if(e.data?.opcbDesign===1&&['ready','applied'].includes(e.data.type))window.webkit.messageHandlers.probe.postMessage(e.data.type+' '+e.data.revision)});", injectionTime: .atDocumentStart, forMainFrameOnly: false))
let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 1000), configuration: config)
let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = view
view.navigationDelegate = probe
view.load(URLRequest(url: URL(string: CommandLine.arguments[1])!))
DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
    view.evaluateJavaScript("JSON.stringify({status:document.querySelector('#status')?.textContent,frame:document.querySelector('iframe')?.src})") { result, error in
        let output: [String: Any] = ["state": result as? String ?? "", "error": error?.localizedDescription ?? "", "navigation": probe.decisions, "diagnostics": probe.diagnostics]
        let data = try! JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
        print(String(data: data, encoding: .utf8)!)
        exit(0)
    }
}
app.run()
