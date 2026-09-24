/**
 * 学会人员页面（#society）的全部显示文案与名单。
 *
 * 修改页面文字和名单时，只改本文件即可：
 *   - societyHero：顶部横幅和标题文字
 *   - societySections：人员区块、姓名、单位和照片路径
 *   - societySortNote：排序说明
 *   - societyActions：底部按钮文字和链接
 *
 * photo 留空时显示空白照片位；补照片时填入 "/assets/people/文件名.jpg"。
 */

export type SocietyPerson = {
  name: string;
  affiliation: string;
  photo?: string;
};

export type SocietySection = {
  id: string;
  icon: "grid" | "people";
  layout: "cards" | "roster";
  title: string;
  people: SocietyPerson[];
};

export const societyHero = {
  banner: {
    src: "/assets/chinavr-2026-committee-banner.png",
    alt: "ChinaVR 2026 第二十六届中国虚拟现实大会 · 生成式 VR 影像单元",
    width: 1672,
    height: 941,
  },
  kicker: ["CHINAVR 2026", ""],
  title: "生成式 VR 影像单元",
  titleEm: "",
  intro: "",
  action: { label: "我要投稿", href: "#home" },
};

export const societySections: SocietySection[] = [
  {
    id: "chair",
    icon: "grid",
    layout: "cards",
    title: "生成式VR影像单元主席",
    people: [{ name: "沈旭昆", affiliation: "北京航空航天大学", photo: "/assets/people/shen-xukun.png" }],
  },
  {
    id: "vice-chair",
    icon: "grid",
    layout: "cards",
    title: "生成式VR影像单元副主席",
    people: [
      { name: "王泽宇", affiliation: "香港科技大学（广州）", photo: "/assets/people/wang-zeyu.jpg" },
      { name: "邵晴", affiliation: "VR导演/新媒体艺术家", photo: "/assets/people/shao-qing.png" },
      { name: "姜涵", affiliation: "北京航空航天大学", photo: "/assets/people/jiang-han.jpg" },
    ],
  },
  {
    id: "steering",
    icon: "people",
    layout: "roster",
    title: "指导委员会",
    people: [
      { name: "陈志伟", affiliation: "禄宝文化传媒公司" },
      { name: "李智渊", affiliation: "延边大学" },
      { name: "刘偲", affiliation: "北京航空航天大学" },
      { name: "宋晓东", affiliation: "上海风语筑文化科技股份有限公司" },
      { name: "宋震", affiliation: "中央戏剧学院" },
      { name: "王莉宁", affiliation: "北京语言大学" },
      { name: "王元韬", affiliation: "北京广播电视台" },
      { name: "吴迪", affiliation: "中国文化产业发展集团有限公司" },
      { name: "姚俊峰", affiliation: "厦门大学" },
      { name: "叶龙", affiliation: "中国传媒大学" },
      { name: "张松海", affiliation: "清华大学" },
    ],
  },
  {
    id: "organizing",
    icon: "people",
    layout: "roster",
    title: "组织委员会",
    people: [
      { name: "白隽瑄", affiliation: "首都体育学院" },
      { name: "陈洪", affiliation: "北京邮电大学" },
      { name: "程明智", affiliation: "北京印刷学院" },
      { name: "郭建伟", affiliation: "北京师范大学" },
      { name: "胡勇", affiliation: "北京航空航天大学" },
      { name: "黄健明", affiliation: "厦门大学" },
      { name: "姜那", affiliation: "首都师范大学" },
      { name: "赖晶亮", affiliation: "广东轻工职业技术大学" },
      { name: "李冉阳", affiliation: "河南工业大学" },
      { name: "李蕊", affiliation: "中国传媒大学" },
      { name: "刘龙", affiliation: "北京印刷学院" },
      { name: "刘鑫达", affiliation: "西北大学" },
      { name: "孟明", affiliation: "中国传媒大学" },
      { name: "沈毅", affiliation: "湖南中烟工业有限责任公司" },
      { name: "施逸青", affiliation: "福建师范大学" },
      { name: "司伟鑫", affiliation: "深圳理工大学" },
      { name: "宋维涛", affiliation: "北京理工大学" },
      { name: "宋文凤", affiliation: "北京信息科技大学" },
      { name: "王楠", affiliation: "北京邮电大学" },
      { name: "王珊", affiliation: "中央戏剧学院" },
      { name: "王玮", affiliation: "哈尔滨工业大学（深圳）" },
      { name: "王笑琨", affiliation: "北京科技大学" },
      { name: "王雪豪", affiliation: "对外经济贸易大学" },
      { name: "王智敏", affiliation: "大连理工大学" },
      { name: "温阳", affiliation: "深圳大学" },
      { name: "翁冬冬", affiliation: "北京理工大学" },
      { name: "吴健", affiliation: "北京航空航天大学" },
      { name: "吴振宇", affiliation: "西南交通大学" },
      { name: "胥森哲", affiliation: "北京科技大学" },
      { name: "谢雪光", affiliation: "北京科技大学" },
      { name: "余日季", affiliation: "湖北大学" },
      { name: "赵志强", affiliation: "深圳职业技术大学" },
      { name: "周锋", affiliation: "北方工业大学" },
    ],
  },
];

export const societySortNote = "注：名单按姓氏拼音排序";

export const societyActions = {
  title: "欢迎参与生成式 VR 影像单元",
  intro: "前往大会主页了解完整赛事信息与最新通知，或直接进入投稿系统提交作品",
  buttons: [
    { label: "ChinaVR2026大会首页", href: "https://ccf.org.cn/chinavr2026", external: true },
    { label: "我要投稿", href: "#home", external: false },
  ],
};
