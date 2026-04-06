import SearchView from "./SearchView";

interface Props {
  query: string;
  tlds?: readonly string[];
  onlyAvailable?: boolean;
  timeoutMs?: number;
}

export default function App({ query, tlds, onlyAvailable, timeoutMs }: Props) {
  return <SearchView query={query} tlds={tlds} onlyAvailable={onlyAvailable} timeoutMs={timeoutMs} />;
}
