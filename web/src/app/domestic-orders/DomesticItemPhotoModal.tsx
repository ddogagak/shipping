"use client";
import {useEffect,useState} from "react";
type Item={wise_stock_id:number;ordered_at:string;item_name:string;item_price:number;image_url:string|null};
export default function DomesticItemPhotoModal({orderId,nickname,onClose}:{orderId:string;nickname:string;onClose:()=>void}) {
 const [items,setItems]=useState<Item[]>([]); const [error,setError]=useState("");const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;fetch("/api/domestic/item-photos?order_id="+encodeURIComponent(orderId),{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"조회 실패");return j;}).then(j=>{if(active)setItems(j.items||[])}).catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[orderId]);
 const date=(s:string)=>new Date(s).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"});
 const days=[...new Set(items.map(x=>date(x.ordered_at)))];
 return <div onMouseDown={onClose} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
  <div onMouseDown={e=>e.stopPropagation()} style={{background:"white",borderRadius:14,width:"min(850px,100%)",maxHeight:"90vh",overflowY:"auto",padding:20}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{margin:0}}>{nickname} · 아이템 상세</h2><button type="button" onClick={onClose} style={{fontSize:22,cursor:"pointer"}}>×</button></div>
   <p style={{color:"#667085",fontSize:12}}>와이스 상품 사진 · 명칭 · 가격 (날짜별)</p>
   {loading?<p>불러오는 중...</p>:error?<p role="alert">{error}</p>:items.length===0?<p>매칭된 상품 사진이 없습니다.</p>:days.map(d=><section key={d}><h3 style={{borderBottom:"1px solid #ddd",paddingBottom:8}}>{d}</h3>{items.filter(x=>date(x.ordered_at)===d).map(x=><div key={x.wise_stock_id} style={{display:"flex",gap:14,alignItems:"center",padding:"10px 0",borderBottom:"1px solid #eee"}}>{x.image_url?<img src={x.image_url} alt={x.item_name} style={{width:80,height:80,objectFit:"cover",borderRadius:8}}/>:<div style={{width:80,height:80,background:"#eee"}}/>}<div><strong>{x.item_name}</strong><p>{Number(x.item_price).toLocaleString("ko-KR")}원</p></div></div>)}</section>)}
  </div>
 </div>;
}
