/**
 * 首页滚动资讯数据。
 * 后续更新时只需修改这里的图片、标题和链接；标题建议控制在 30 个汉字以内。
 */
export type NewsItem = {
  image: string;
  title: string;
  href: string;
};

export const newsItems = [
  {
    image: "/assets/news/news-01.jpg",
    title: "北航李波教授将作大会主旨报告！",
    href: "https://mp.weixin.qq.com/s/SYdWOlrP02d8dI6Bsq7oVA",
  },
  {
    image: "/assets/news/news-02.jpg",
    title: "上科大副校长虞晶怡教授将作大会主旨报告！",
    href: "https://mp.weixin.qq.com/s/99_0se5c1ssHZ2Nhdb1Izg",
  },
  {
    image: "/assets/news/news-03.jpg",
    title: "青海大学校长史元春教授将作大会主旨报告！",
    href: "https://mp.weixin.qq.com/s/9cGtxycf3cjCYpwDY-fz_g",
  },
  {
    image: "/assets/news/news-04.jpg",
    title: "中国工程院张文军院士将作大会主旨报告！",
    href: "https://mp.weixin.qq.com/s/Csf4npWO8e84jFMTK5lX6Q",
  },
  {
    image: "/assets/news/news-05.jpg",
    title: "中国科学院李树涛院士受邀将作大会主旨报告！",
    href: "https://mp.weixin.qq.com/s/lzvF-h6JQJNzGAMYfXfSvA",
  },
] satisfies readonly NewsItem[];
