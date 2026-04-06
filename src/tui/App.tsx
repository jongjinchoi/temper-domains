import SearchView from "./SearchView";

interface Props {
  query: string;
  tlds?: readonly string[];
  onlyAvailable?: boolean;
}

export default function App({ query, tlds, onlyAvailable }: Props) {
  return <SearchView query={query} tlds={tlds} onlyAvailable={onlyAvailable} />;
}
