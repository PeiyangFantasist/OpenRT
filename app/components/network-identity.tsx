import {useEffect,useState,useSyncExternalStore} from 'react';
import {AnimatedDialog} from './animated-dialog';
import {companionDays} from '../../lib/market';
import {getUserSettings,subscribeUserSettings} from '../../lib/user-settings';
const CONSENT_KEY='openrt-location-consent-v1';
const cached=new Map<string,{location:string;time:number}>();
export function NetworkIdentity({joinedAt,today,active}:{joinedAt:string;today:string;active:boolean}){
  const {language}=useSyncExternalStore(subscribeUserSettings,getUserSettings,getUserSettings);
  const [location,setLocation]=useState(''),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[consented,setConsented]=useState(()=>{try{return localStorage.getItem(CONSENT_KEY)==='allowed';}catch{return false;}}),[permission,setPermission]=useState(false);
  const choose=(allowed:boolean)=>{try{if(allowed)localStorage.setItem(CONSENT_KEY,'allowed');else localStorage.removeItem(CONSENT_KEY);}catch{}if(!allowed){cached.clear();setLocation('');}setConsented(allowed);setPermission(false);};
  useEffect(()=>{
    if(!active||!consented)return;
    const saved=cached.get(language);
    if(saved&&Date.now()-saved.time<3600000){setLocation(saved.location);setStatus('ready');return;}
    let live=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    setStatus('loading');
    // Only coarse location is requested; no GPS, raw IP or coordinates are retained.
    fetch(`https://ipwho.is/?fields=success,country,region&lang=${language==='en'?'en':'zh-CN'}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'})
      .then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then((value:unknown)=>{
        const v=value as {success?:unknown;country?:unknown;region?:unknown};
        if(!v||v.success!==true||typeof v.country!=='string'||!v.country.trim()||v.country.length>100)throw new Error();
        const region=typeof v.region==='string'&&v.region.length<=100?v.region.trim():'';
        const label=[v.country.trim(),region].filter((s,i,a)=>s&&a.indexOf(s)===i).join(' · ');
        if(!live)return;cached.set(language,{location:label,time:Date.now()});setLocation(label);setStatus('ready');
      }).catch(()=>{if(live)setStatus('error');}).finally(()=>clearTimeout(timer));
    return()=>{live=false;clearTimeout(timer);controller.abort();};
  },[active,language,consented]);
  const label=!consented?(language==='en'?'Country & region':'显示国家/地区'):status==='ready'?location:status==='error'?(language==='en'?'Location unavailable':'位置暂不可用'):(language==='en'?'Locating…':'定位中…');
  return <><span className="network-identity"><button type="button" className="location-display" onClick={()=>setPermission(true)} title={language==='en'?'Approximate network location; a VPN or proxy may change the result. Source: ipwho.is.':'国家和地区按网络出口估算；VPN或代理可能影响结果。来源：ipwho.is。'}><span data-user-content>{label}</span></button><span title={language==='en'?'Based on the first locally saved visit, including the first day. Clearing market cache does not reset it.':'按本机首次保留日期计算，包含首日；清理行情缓存不会重置。'}>OpenRT已陪伴您 {companionDays(joinedAt,today)} 天</span></span><AnimatedDialog open={permission} onClose={()=>setPermission(false)} title={language==='en'?'Country & region':'国家和地区'} className="personal-dialog"><div className="personal-info"><p>{language==='en'?'To display your approximate country and region, this browser sends your public IP address to ipwho.is. GPS is not used. A VPN or proxy may show its exit location. This browser remembers your choice.':'显示大致国家和地区时，浏览器会向 ipwho.is 发送当前公网 IP。不会读取 GPS；VPN 或代理可能显示出口地区。本浏览器会记住你的选择。'}</p></div><div className="personal-dialog-actions"><button className="secondary-button" onClick={()=>setPermission(false)}>{language==='en'?'Cancel':'取消'}</button><button className="primary-button" onClick={()=>choose(!consented)}>{consented?(language==='en'?'Turn off location display':'关闭地区显示'):(language==='en'?'Allow lookup':'允许查询')}</button></div></AnimatedDialog></>;
}
