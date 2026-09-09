import { useState } from "react";
import {
  AsOf,
  Badge,
  Banner,
  Button,
  ChangeCell,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Panel,
  PriceCell,
  Select,
  Spinner,
  Table,
  Tabs,
} from "../design-system";

export function Gallery() {
  const [tab, setTab] = useState("One");
  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <h1 style={{ fontSize: "var(--fs-lg)", fontWeight: 500 }}>Gallery</h1>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button>Save note</Button>
        <Button variant="ghost">Pin to watchlist</Button>
        <Button variant="danger">Delete</Button>
        <IconButton label="pan">P</IconButton>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Input placeholder="Search" />
        <Select>
          <option>HOSE</option>
        </Select>
        <label>
          <Checkbox defaultChecked /> watchlist
        </label>
        <Badge kind="up">up</Badge>
        <Badge kind="down">down</Badge>
        <Badge kind="warn">stale</Badge>
        <Spinner />
        <AsOf time="2026-09-08 15:00" />
      </div>
      <Tabs tabs={["One", "Two"]} value={tab} onChange={setTab} />
      <Banner kind="info">Info banner</Banner>
      <Panel>
        <Table>
          <thead>
            <tr>
              {["Ticker", "Last", "Change"].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", height: 36 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: 36 }}>
              <td style={{ fontFamily: "var(--font-num)" }}>VCB</td>
              <td>
                <PriceCell value={91000} />
              </td>
              <td>
                <ChangeCell value={1.2} />
              </td>
            </tr>
            <tr style={{ height: 36 }}>
              <td style={{ fontFamily: "var(--font-num)" }}>HPG</td>
              <td>
                <PriceCell value={26500} />
              </td>
              <td>
                <ChangeCell value={-0.8} />
              </td>
            </tr>
          </tbody>
        </Table>
      </Panel>
      <Panel>
        <div style={{ display: "flex", gap: 4 }}>
          {["P", "H", "T", "R", "F", "X"].map((t) => (
            <IconButton key={t} label={t}>
              {t}
            </IconButton>
          ))}
        </div>
        <div style={{ height: 80, background: "var(--bg)", border: "1px solid var(--border)", marginTop: 8 }} />
      </Panel>
      <EmptyState text="No daily bars for VCB" />
    </div>
  );
}
