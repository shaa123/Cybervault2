import React from "react";

const SORT_OPTIONS = [
  { id: "random", label: "RANDOM" },
  { id: "name-asc", label: "NAME A→Z" },
  { id: "name-desc", label: "NAME Z→A" },
  { id: "date-desc", label: "NEWEST" },
  { id: "date-asc", label: "OLDEST" },
  { id: "size-desc", label: "LARGEST" },
  { id: "size-asc", label: "SMALLEST" },
  { id: "type", label: "TYPE" },
];

export default function SearchBar({ search, onSearch, sort, onSort }) {
  return (
    <div className="search-bar">
      <input
        className="search-input"
        placeholder="Search files..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <select className="sort-select" value={sort} onChange={(e) => onSort(e.target.value)}>
        {SORT_OPTIONS.map(o => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
