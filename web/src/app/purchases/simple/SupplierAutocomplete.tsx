"use client";

import { useId, useRef, useState, type CSSProperties } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  suppliers: string[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: CSSProperties;
};

export default function SupplierAutocomplete({ value, onChange, suppliers, label, placeholder, disabled, loading, style }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().normalize("NFKC").toLowerCase();
  const matches = filter && query
    ? suppliers.filter(name => name.normalize("NFKC").toLowerCase().includes(query))
    : suppliers;

  function showAll() { setOpen(true); setFilter(false); setActive(-1); }
  function choose(name: string) { onChange(name); setOpen(false); setActive(-1); }

  return <div style={{position:"relative",width:style?.width || "100%",minWidth:0}}>
    <div style={{display:"flex",alignItems:"stretch"}}>
      <input
        ref={inputRef}
        aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open && !disabled}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined}
        value={value} placeholder={placeholder} disabled={disabled} autoComplete="off"
        style={{...style,width:"100%",minWidth:0,borderTopRightRadius:0,borderBottomRightRadius:0}}
        onFocus={showAll}
        onClick={()=>{if(!open)showAll();}}
        onBlur={()=>{setOpen(false);setActive(-1);}}
        onChange={e=>{onChange(e.target.value);setFilter(true);setOpen(true);setActive(-1);}}
        onKeyDown={e=>{
          if(e.nativeEvent.isComposing) return;
          if(e.key === "Escape" && open) {e.preventDefault();setOpen(false);setActive(-1);}
          else if(e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if(!open) {showAll();setActive(e.key==="ArrowDown"?0:Math.max(0,suppliers.length-1));}
            else if(matches.length) setActive(i=>e.key==="ArrowDown"?(i+1)%matches.length:(i<=0?matches.length-1:i-1));
          } else if(e.key === "Enter" && open && active >= 0 && matches[active]) {e.preventDefault();choose(matches[active]);}
        }}
      />
      <button type="button" disabled={disabled} aria-label={`${label} 목록 보기`} aria-expanded={open && !disabled}
        onMouseDown={e=>e.preventDefault()} onClick={()=>{if(open)setOpen(false);else{inputRef.current?.focus();showAll();}}}
        style={{border:"1px solid #d7dce2",borderLeft:0,borderRadius:"0 9px 9px 0",background:"#f8fafc",color:"#374151",padding:"0 12px",cursor:"pointer",fontSize:13}}>▾</button>
    </div>
    {open && !disabled && <div id={`${id}-options`} role="listbox" aria-label="기존 거래처" style={{position:"absolute",zIndex:30,top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid #cbd5e1",borderRadius:8,boxShadow:"0 4px 12px #0002",maxHeight:240,overflowY:"auto",padding:4}}>
      {matches.map((name,i)=><button key={name} id={`${id}-option-${i}`} type="button" role="option" aria-selected={active===i || value===name} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(name)}
        onMouseEnter={()=>setActive(i)} style={{display:"block",width:"100%",border:0,borderRadius:5,textAlign:"left",cursor:"pointer",padding:"9px 11px",fontSize:14,fontWeight:value===name?700:400,color:"#111827",background:active===i?"#e0e7ff":value===name?"#f1f5f9":"#fff"}}>{name}</button>)}
      {!matches.length && <div role="status" style={{padding:"9px 11px",fontSize:13,color:"#6b7280"}}>{loading?"거래처 불러오는 중...":filter && query?"일치하는 거래처 없음 · 그대로 신규 입력 가능":"기존 거래처 없음 · 신규 입력 가능"}</div>}
    </div>}
  </div>;
}
