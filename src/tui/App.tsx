import SearchView from "./SearchView";

interface Props {
  query: string;
  tlds?: readonly string[];
}

export default function App({ query, tlds }: Props) {
  return <SearchView query={query} tlds={tlds} />;
}
