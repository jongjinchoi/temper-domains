import { useApp } from "ink";
import { useState } from "react";
import HistoryView from "./HistoryView.tsx";
import SearchView from "./SearchView.tsx";
import SuggestView from "./SuggestView.tsx";
import WatchlistView from "./WatchlistView.tsx";

type Screen = "search" | "suggest" | "history" | "list";

interface Props {
  query: string;
  tlds?: readonly string[];
  onlyAvailable?: boolean;
  timeoutMs?: number;
}

export default function App({ query, tlds, onlyAvailable, timeoutMs }: Props) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("search");

  const quit = () => exit();
  const back = () => setScreen("search");

  switch (screen) {
    case "search":
      return (
        <SearchView
          query={query}
          tlds={tlds}
          onlyAvailable={onlyAvailable}
          timeoutMs={timeoutMs}
          onNavigate={(s: string) => setScreen(s as Screen)}
          onQuit={quit}
        />
      );
    case "suggest":
      return <SuggestView query={query} onBack={back} onQuit={quit} />;
    case "history":
      return <HistoryView onBack={back} onQuit={quit} />;
    case "list":
      return <WatchlistView onBack={back} onQuit={quit} />;
  }
}
