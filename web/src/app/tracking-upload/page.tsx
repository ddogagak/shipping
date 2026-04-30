"use client";

import { useState } from "react";

export default function Page() {
  const [carrier, setCarrier] = useState("k-packet");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<any[]>([]);

  async function preview() {
    const fd = new FormData();
    fd.append("carrier", carrier);

    if (carrier === "k-packet" && file) {
      fd.append("file", file);
    }
    if (carrier === "egs") {
      fd.append("text", text);
    }

    const res = await fetch("/api/ebay/tracking-preview", {
      method: "POST",
      body: fd,
    });

    const json = await res.json();
    setRows(json.rows || []);
  }

  async function update() {
    await fetch("/api/ebay/tracking-update", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });

    alert("업데이트 완료");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Tracking Upload</h1>

      <div>
        <button onClick={() => setCarrier("k-packet")}>K-Packet</button>
        <button onClick={() => setCarrier("egs")}>EGS</button>
      </div>

      {carrier === "k-packet" && (
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      )}

      {carrier === "egs" && (
        <textarea
          style={{ width: "100%", height: 200 }}
          onChange={(e) => setText(e.target.value)}
        />
      )}

      <button onClick={preview}>미리보기</button>

      <hr />

      <button onClick={update}>
        선택 {rows.filter((r) => r.selected).length}건 업데이트
      </button>

      <table>
        <thead>
          <tr>
            <th></th>
            <th>주문번호</th>
            <th>키</th>
            <th>이름</th>
            <th>국가</th>
            <th>운송장</th>
            <th>현지</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={(e) => {
                    const copy = [...rows];
                    copy[i].selected = e.target.checked;
                    setRows(copy);
                  }}
                />
              </td>
              <td>{r.orderNo}</td>
              <td>{r.key}</td>
              <td>{r.name}</td>
              <td>{r.country}</td>
              <td>{r.tracking}</td>
              <td>{r.local}</td>
              <td>{r.match}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
