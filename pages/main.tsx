import React from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "../app/interactions.css";
import "@fontsource/jetbrains-mono/latin-400.css";

class AppBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main style={{ maxWidth: 620, margin: "12vh auto", padding: 24, fontFamily: "system-ui" }}><h1>OpenRT</h1><p>页面暂时无法显示。请刷新后重试；如果问题持续，请在 GitHub 提交问题。</p><button onClick={() => location.reload()}>重新载入</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<AppBoundary><Home /></AppBoundary>);
