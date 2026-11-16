import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
const Admin = lazy(() => import("./Admin"));
const Booking = lazy(() => import("./Booking"));
const Landing = lazy(() => import("./Landing"));
function Root() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const fn = () => setPath(location.pathname);
    addEventListener("popstate", fn);
    return () => removeEventListener("popstate", fn);
  }, []);
  return (
    <Suspense
      fallback={
        <div className="loading">
          <span className="spinner" />
          Chargement…
        </div>
      }
    >
      {path.startsWith("/book/") || path.startsWith("/manage/") ? (
        <Booking key={path} />
      ) : path === "/" ? (
        <Landing />
      ) : (
        <Admin path={path} />
      )}
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(<Root />);
