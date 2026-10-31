import Link from "next/link";
import styles from "./administration.module.css";
export function ListPagination({page,totalPages,total,href,locale}:{page:number;totalPages:number;total:number;href:string;locale:"ru"|"en"}){
 const link=(p:number)=>{const [path,raw]=href.split("?"),params=new URLSearchParams(raw);params.set("page",String(p));return `${path}?${params}`;};
 return <nav className={styles.search} aria-label={locale==="en"?"List pages":"Страницы списка"}>{page>1&&<Link className={styles.pageLink} href={link(page-1)}>{locale==="en"?"Previous":"Назад"}</Link>}<span>{page} / {totalPages} · {locale==="en"?"Total":"Всего"}: {total}</span>{page<totalPages&&<Link className={styles.pageLink} href={link(page+1)}>{locale==="en"?"Next":"Далее"}</Link>}</nav>;
}
