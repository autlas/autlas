import AutlasApp from "./app/App";
import "./autlas-frame.css";

export default function AutlasFrame() {
  return (
    <div className="autlas-wrap">
      <span className="autlas-badge">live demo · mock data</span>
      <div className="autlas-frame">
        <div className="autlas-viewport">
          <AutlasApp />
        </div>
      </div>
    </div>
  );
}
