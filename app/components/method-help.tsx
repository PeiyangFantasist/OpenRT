"use client";

import { Fragment, useState } from "react";
import { MathFormula } from "./math";

type HelpPage = {
  label: string;
  title: string;
  paragraphs: string[];
  math?: string[];
  variables?: { tex: string; description: string }[];
  example?: string;
  note?: string;
  links?: { label: string; href: string }[];
};
type HelpTopic = { id: string; label: string; pages: HelpPage[] };

const topics: HelpTopic[] = [
  {
    id: "rt", label: "RT-α", pages: [
      {
        label: "定义", title: "同样持有期，不同起投日",
        paragraphs: [
          "先固定持有天数，再把历史上每个有净值的日期都当作一次起点。每次假设只在起点投入、到期结算，就得到一组可比较的持有期收益。",
          "曲线横轴是起投日期，纵轴是这笔投资持有到期的收益率。它不是基金净值曲线，也不是从同一个起点累计到各天的涨幅。",
          "S 使用页面标明的数据口径：通常为分红、拆分事件近似校正的指数；无法校正时退回单位净值。比较前应先确认口径一致。",
        ],
        math: [String.raw`R_{\alpha}(T)=\frac{S\!\left(E(T+\alpha)\right)}{S(T)}-1`],
        variables: [
          { tex: "T", description: "起投净值日" },
          { tex: String.raw`\alpha`, description: "持有自然日数" },
          { tex: "E(x)", description: "目标日后首个净值日，含当天" },
        ],
      },
      {
        label: "算例", title: "30 天的收益怎样算",
        paragraphs: [
          "假设 1 月 2 日的指数为 1.20，选择 α = 30 天。目标日是 2 月 1 日；若当天没有净值，而 2 月 2 日首个可用值为 1.32，就用后者结算。",
          "这次投入的指数涨到起点的 1.10 倍，所以区间收益为 10%。实际持有 31 天，曲线仍归入所选的 30 天目标规则，并在样本中保留实际到期日。",
          "把起点移到下一个净值日，再按同一规则重复计算，就会得到曲线上的下一个点。每个点都是一笔独立设定起止日的假想投资。",
        ],
        math: [String.raw`R_{30}(T)=\frac{1.32}{1.20}-1=0.10=10\%`],
        example: "以上为假设算例。只有目标日后 10 天内出现净值，窗口才会被保留。",
      },
      {
        label: "日期规则", title: "固定天数与完整窗口",
        paragraphs: [
          "α 可自定义为 1–3650 个自然日。1mo / 3mo / 6mo 对应 30 / 90 / 180 天；1y / 2y / 3y 对应 365 / 730 / 1095 天。快捷项不按自然月或周年推进，闰年也不改变天数。",
          "目标日之后最多顺延 10 个自然日，寻找首条净值。若等待更久，整段窗口跳过，避免把长时间停牌或数据缺失当作正常持有期。",
          "到数据末尾仍没有到期净值的窗口属于未到期，不进入统计，也不填成零收益。界面分别列出长缺口和未到期数量，方便理解样本为何减少。",
        ],
        math: [String.raw`0\le E(T+\alpha)-(T+\alpha)\le 10\ \mathrm{days}`],
        note: "曲线及统计均为区间收益，未年化；持有期越长，通常可用窗口越少。",
      },
    ],
  },
  {
    id: "statistics", label: "统计指标", pages: [
      {
        label: "历史比例", title: "亏损率 包含零收益",
        paragraphs: [
          "把全部完整窗口看作一份历史样本，数出其中收益小于或等于零的窗口，再除以总数。这里的 P 是经验比例，帽号表示它来自样本，而不是已知的未来概率。",
          "例如 5 个窗口的收益为 −10%、0%、5%、10%、20%。前两个属于非正收益，因此历史非正收益比例是 40%；正收益比例则为 60%。",
          "如果一个完整窗口也没有，比例显示为空，不能解释为零风险。这个统计只概括所选基金、持有期和已收录历史；换一段历史，结果也可能明显改变。",
        ],
        math: [String.raw`\widehat P(R\le0)=\frac{\sum_{i=1}^{n}\mathbf{1}\{R_i\le0\}}{n}`, String.raw`\frac{2}{5}=40\%`],
        note: "40% 是上述假设历史样本的比例，不表示下一次投资有 40% 的亏损概率。",
      },
      {
        label: "中心与分布", title: "均值、分位数和标准差",
        paragraphs: [
          "均值是所有窗口收益的算术平均；中位数把排序后的样本分成两半。少数很高的收益会抬高均值，因此两者一起看，比只看平均数更容易理解分布。",
          "P5、P25、P75、P95 是经验分位数。本工具按位置 (n − 1)p，在相邻排序收益之间线性插值。最好和最差窗口是历史极值，不能作为未来的收益上下界。",
          "标准差衡量收益围绕均值的离散程度，采用样本分母 n − 1。数值越大，说明这些持有期结果越分散；仅一个样本时不计算标准差。这些指标均未年化。",
        ],
        math: [String.raw`\bar R=\frac{1}{n}\sum_{i=1}^{n}R_i`, String.raw`s=\sqrt{\frac{\sum_{i=1}^{n}(R_i-\bar R)^2}{n-1}}`],
      },
      {
        label: "收益密度", title: "把历史收益平滑成一条曲线",
        paragraphs: [
          "收益密度曲线采用高斯核密度估计（KDE）：在每个历史窗口收益处放一条小钟形曲线，再将它们等权平均。它帮助观察收益集中在哪些位置，不要求整组收益服从正态分布。",
          "公式中收益用小数表示，0.01 即 1%。图的纵轴显示每 1 个百分点的密度 g；峰较高，表示附近历史收益更集中。密度不是某个收益值发生的概率，也不应直接读成百分比。",
          "某个收益区间的概率估计，要看该区间曲线下的面积。图形只展示平滑后的历史形状，没有为原样本增加新观测。",
        ],
        math: [String.raw`\widehat f_h(r)=\frac{1}{nh\sqrt{2\pi}}\sum_{i=1}^{n}e^{-(r-R_i)^2/(2h^2)}`, String.raw`g(r)=0.01\,\widehat f_h(r)`],
        note: "亏损率 仍按原始完整窗口直接计数，未改为密度曲线左侧面积；两者可能不同。",
      },
      {
        label: "平滑带宽", title: "带宽决定曲线有多平滑",
        paragraphs: [
          "带宽 h 控制每个小钟形的宽度：较大时更平滑，可能掩盖多个峰；较小时更细碎，也可能把偶然变化画成峰。平滑程度是显示参数，不是基金的风险参数。",
          "一般采用下面的 Silverman 经验带宽。s 为样本标准差，IQR 为 P75 减 P25，n 为完整窗口数；四分位距为零但标准差非零时改用标准差计算。",
          "若全部收益相同，或只有一个样本，采用显示用带宽：0.25 个百分点与平均收益绝对值的 1% 取较大者。此时钟形的宽度来自平滑设置，不代表样本真的有波动。",
        ],
        math: [String.raw`h=0.9\min\!\left(s,\frac{\mathrm{IQR}}{1.349}\right)n^{-1/5}`],
        note: "带宽随当前历史样本自动计算。窗口高度重叠，公式中的 n 不应解释为有效独立样本量。",
        links: [{ label: "SciPy：高斯核密度与带宽说明", href: "https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.gaussian_kde.html" }],
      },
      {
        label: "面积与边界", title: "区间看面积，尾部保留解释边界",
        paragraphs: [
          "某个收益区间在平滑模型下的概率估计，是该区间曲线下的面积。公式按小数收益率积分；图的横轴若按百分点读取，就配合每 1 个百分点的密度 g 计算面积。",
          "高斯核带有无限尾部，所以曲线可延伸到历史最小值、最大值之外。尾部来自平滑假设，不表示这些收益曾经出现；有限显示范围之外也可能还有很小的模型面积。",
          "重叠窗口相互相关，核密度估计不会使它们变成独立样本。曲线形状和区间面积只概括已选历史，不能直接当作未来收益的概率预测。",
        ],
        math: [String.raw`\widehat P_h(a\le R\le b)=\int_a^b\widehat f_h(r)\,dr`],
        example: "看 0% 到 10% 的收益区间，应看这一段下方的面积，而不是只读取 5% 处曲线的高度。鼠标或触控提示中的历史累计占比仍来自原样本计数。",
      },
      {
        label: "样本相关", title: "窗口数不等于独立试验数",
        paragraphs: [
          "若 α = 365 天，两个相邻起投日只差一天，它们的持有区间可能共享约 364 天。同一轮上涨或下跌会同时影响大量窗口，所以曲线上的点并不相互独立。",
          "即使有 1000 个窗口，也不能直接当作做过 1000 次独立试验，更不能据此套用独立二项试验的置信区间。更多重叠点主要让起投日期的变化更细，不会创造新历史。",
          "界面另列非重叠窗口数：按较早到期顺序选取互不重叠的持有区间。它只提示历史能容纳多少段这样的区间；市场仍会跨区间相关，因此也不等于有效独立样本量。",
        ],
        example: "解释比例时，同时查看历史区间、完整窗口数和非重叠窗口数。长持有期的漂亮结果也可能只来自少数市场阶段。",
      },
      {
        label: "双基金对比", title: "双基金对比规则",
        paragraphs: [
          "仅取截至北京时间今日、两基金都有净值的日期交集，不插值补日。RT 使用同一 α、相同起止净值日；定投使用相同金额、日期与费率，在共同日期投入、结算。交集可能缩短历史、减少样本。",
          "历史非正收益比例、样本标准差较低者，在该指标上标优；均值、中位数、分位数、末值、利润及收益率较高者标优。最差窗口较高表示历史低端收益更高；最好窗口较高仅说明历史上尾更高。",
          "窗口数、成本、投入次数和费用保持中性。差异在数值容差内视为并列；缺失或无效数据没有胜者。红框与「優勝！」只表示按此规则赢了这一项，不构成整体投资推荐，也不证明未来风险更小。",
        ],
        note: "共同净值日期不代表当时都能成交；仍须核对复权口径与 QDII 披露时差。",
      },
    ],
  },
  {
    id: "dca", label: "定投", pages: [
      {
        label: "计算方法", title: "把每笔投入换成指数份额",
        paragraphs: [
          "在每个符合条件的净值日投入同样的金额 A，扣除简化申购费后，按当日指数 S 换成份额。所有份额相加得到 Q；采用校正指数意味着按模型假设进行分红再投资。",
          "结算时，用总份额乘结算指数，并扣除简化赎回费，得到末值 V。成本 C 是实际支付的全部金额，包含已经从每笔投入中扣掉的申购费，不能再把这些费用重复加一次。",
          "收益是末值减成本，再除以成本得到累计收益率。这里允许小数份额，费率是固定比例模型，不等同于某只基金按渠道、持有期计算的真实费用。",
        ],
        math: [String.raw`Q=\sum_{i=1}^{n}\frac{A(1-f_{\rm buy})}{S(t_i)}`, String.raw`\begin{gathered}V=Q\,S(t_s)(1-f_{\rm sell}),\quad C=nA\\\Pi=V-C,\qquad R=\Pi/C\end{gathered}`],
      },
      {
        label: "算例", title: "三次投入，之后再结算",
        paragraphs: [
          "假设不收申赎费，每次投入 100 元，只在前三个净值日投资；这三天的指数依次为 1、2、1。相同金额在价格较高时买到较少份额，在价格较低时买到较多份额。",
          "三笔分别得到 100、50、100 份，总计 250 份，成本为 300 元。随后停止投入，在第四个净值日结算；若指数为 1.5，末值就是 375 元。",
          "因此收益为 75 元，累计收益率为 25%。第四天只是结算日，不在定投起止区间内，所以不再投入 100 元。换一个结算价格，结果会跟着改变，定投并不保证盈利。",
        ],
        math: [String.raw`Q=\frac{100}{1}+\frac{100}{2}+\frac{100}{1}=250`, String.raw`V=250\times1.5=375,\qquad R=\frac{75}{300}=25\%`],
        note: "以上为假设算例；25% 不是年化收益率，也不是资金加权收益率。",
      },
      {
        label: "交易规则", title: "无净值日跳过，不补投",
        paragraphs: [
          "定投起始日和终止日都包含在区间内；只在有净值记录的日期各投入一次。周末、节假日和缺失日期跳过，不补投，也不会把这些天的金额累积到下一次。",
          "日期须在已公布历史范围内，并满足起始日 ≤ 终止日 ≤ 结算日。若结算日位于历史中但没有净值，向前取最近一条记录；不能选择超过最新净值所属日的未来日期。",
          "申赎费默认零，可输入固定比例；模型未重建申购暂停、限额、交易截止时间、到账确认、阶梯费率或实际份额舍入。基金运作费通常已体现在净值中，实际可成交性需另行核对。",
        ],
        note: "这是按净值记录进行的历史回溯；有净值不代表当天一定能成功申购。",
      },
    ],
  },
  {
    id: "nav", label: "净值与复权", pages: [
      {
        label: "为何校正", title: "分红后的净值下降不全是亏损",
        paragraphs: [
          "单位净值表示每份基金的净资产。基金分红时，部分资产以现金或再投资份额交给持有人，单位净值会相应下降；拆分也会改变每份价格和持有份数。",
          "假设分红前单位净值为 1.20，分红后为 1.10，每份同时得到 0.10 元现金。只比较两个净值会显示下跌约 8.33%，但把现金算回去，分红这一动作本身并没有使投资者亏损。",
          "因此跨分红、拆分计算持有收益时，需要一致的校正口径。累计净值通常把历史分红加回，却不等于持续再投资的指数，不能简单用累计净值之比代替总回报。",
        ],
        math: [String.raw`\frac{1.10}{1.20}-1\approx-8.33\%`, String.raw`\frac{1.10+0.10}{1.20}-1=0`],
      },
      {
        label: "实现公式", title: "只在事件日桥接价格变化",
        paragraphs: [
          "U 是原始单位净值，F 是累计校正因子，研究指数为 S = FU。普通日期保持 F 不变，让指数保留单位净值的精确变化，避免每天累乘舍入后的涨幅。",
          "当上游明确标记分红或拆分，并提供可用的当日增长率时，按下式更新 F，使指数在事件日的变化与源增长率一致。g 采用小数形式，例如源写 2%，公式中就是 0.02。",
          "这种方法可以消除已标记事件造成的机械跳变，但源增长率仍有舍入误差，也没有逐笔核验全部分红、拆分或再投资确认日。因此它是近似事件校正，不是基金公司认证的正式复权净值。",
        ],
        math: [String.raw`F_t=F_{t-1}\frac{1+g_t}{U_t/U_{t-1}}`, String.raw`S_t=F_tU_t`],
        links: [{ label: "天天基金：分红与再投资", href: "https://fundtest.eastmoney.com/help/question_250.html" }],
      },
      {
        label: "回退口径", title: "不能可靠校正时如何处理",
        paragraphs: [
          "程序只把能够识别的分红、拆分等文字当作事件。事件缺少可用增长率、出现未知说明，或发现明显而未标记的净值与增长率不一致时，不会猜一个分红金额或拆分倍数。",
          "此时整段序列退回原始单位净值，并在界面明确显示未复权及原因。前面曾成功校正的部分也一并撤回，避免把两种口径混在同一条曲线里。",
          "回退后，跨事件收益可能失真，定投也不能视为已包含全部分红收益。即使没有触发回退，上游仍可能漏标事件；没有事件标记，只说明所获数据未提供标记，不证明历史上从未发生事件。",
        ],
        math: [String.raw`S_t=U_t\quad\text{(raw NAV fallback)}`],
        note: "涉及大额分红、拆分或异常跳变时，应结合基金公司公告核对结果。",
      },
    ],
  },
  {
    id: "dates", label: "QDII与日期", pages: [
      {
        label: "三个时间", title: "净值所属日不等于可见时间",
        paragraphs: [
          "净值所属日说明价格对应哪一天的资产估值；实际披露时间说明投资者什么时候能看到它；抓取时间说明本站何时取得这份数据。页面分别显示所属日和抓取时间，不把后者当作估值日。",
          "例如，假设周一的净值在周二晚间公布，本站周三才抓取，那么它仍是周一净值。看到抓取时间为周三，不能把这条记录解释为周三的涨跌或即时可成交价格。",
          "目前历史源不提供每条记录的实际披露时间，所以无法从净值日期证明当时已知这个价格。按所属日画出的历史曲线适合回顾表现，不能直接当作无信息延迟的实时交易策略。",
        ],
        example: "假设时序：周一估值 → 周二披露 → 周三抓取。这个例子不表示所有基金都有固定一天延迟。",
      },
      {
        label: "取日方向", title: "RT 向后找，定投结算向前找",
        paragraphs: [
          "把已公布净值日期集合记为 D。RT 需要完成至少 α 天的持有，因此在目标日当天或之后取首条净值；定投结算则不能引用结算日以后的价格，所以取当天或之前的末条净值。",
          "例如回看一个已有后续历史记录的周末：RT 若在周六到期，可顺延到下一条净值，但不得超过 10 天容差；定投若指定周六结算，则按周六之前最近净值估值。",
          "两种方向服务于不同的问题，不能混用。程序不插值补出周末价格，也不把未来已知的数据提前使用。若结算日超过目前最新所属日，会要求改用已公布的历史日期。",
        ],
        math: [String.raw`E(x)=\min\{t\in\mathcal D:t\ge x\}`, String.raw`B(x)=\max\{t\in\mathcal D:t\le x\}`],
      },
      {
        label: "每日滚动", title: "到期且有已公布净值，才计入窗口",
        paragraphs: [
          "窗口需满足目标日已到，且实际到期净值已取得、不晚于今天，顺延不超过 10 天。d 是北京时间今日，L 是已取得的最新净值所属日。",
          "例如 α = 30 天：2026-10-29 取得当天净值后，9 月 29 日起投才完整；9 月 30 日起投须等 10 月 30 日或容差内首条净值公布。日历换日但没有到期净值，仍不计算。",
          "改 α、更新净值或换日都会重算。页面每 30 秒检查北京日期，换日尝试刷新官方源，可见时每 15 分钟检查缓存；这是每日滚动，不承诺盘中即时更新。",
        ],
        math: [String.raw`\begin{gathered}T+\alpha\le d\\E(T+\alpha)\le\min(d,L)\end{gathered}`],
      },
      {
        label: "QDII", title: "境外市场带来披露时差",
        paragraphs: [
          "QDII 投资境外资产，交易时区、当地休市、汇率换算及估值确认流程与境内市场不同。最新已公布净值可能落后几个日期；具体节奏以该基金合同和公告为准，不能统一假定固定延迟。",
          "本站依据源名称中的 QDII 标识提供提醒，并保留缺失日期；不把较早净值改成今日净值，也不生成尚未公布的价格。境内外节假日不同，较长日期缺口未必意味着数据源故障。",
          "模拟仍按净值所属日回溯，未重建当年的申购开放状态、额度、确认时间和逐条披露时刻。因此 QDII 的收益曲线尤其不能解释为当时能够即时观察并成交的报价。",
        ],
        links: [{ label: "易方达：QDII 净值披露", href: "https://edu.efunds.com.cn/c/42/42718.shtml" }],
      },
    ],
  },
  {
    id: "sources", label: "来源与局限", pages: [
      {
        label: "更新与缓存", title: "每天检查，优先使用缓存",
        paragraphs: [
          "历史日净值来自东方财富 / 天天基金公开资源，不需要 API 密钥，但不是承诺稳定服务的正式开放接口。当前模型适用于单位净值基金；以万份收益计价的货币基金暂不支持。",
          "自动更新计划为北京时间每天 09:20、19:20、23:20，包含周末，以检查 QDII 或较晚披露的数据。调度可能延后；一次成功运行也不保证上游已经发布当天净值。",
          "查询优先用抓取后 18 小时内的定时快照，或 6 小时内的较新浏览器缓存；超期再尝试官方源。刷新失败时保留原抓取时间并标记旧缓存。这些期限衡量缓存年龄，不等于净值所属日的新鲜度。",
        ],
        links: [
          { label: "天天基金", href: "https://fund.eastmoney.com/" },
          { label: "AKShare 接口说明", href: "https://akshare.akfamily.xyz/data/fund/fund_public.html" },
        ],
      },
      {
        label: "怎样使用", title: "比较历史风险，保留外推边界",
        paragraphs: [
          "可以比较同一基金在不同持有期的非正收益比例、下尾分位数和最差窗口，观察风险是否集中于某些起投阶段。定投曲线则帮助核对投入节奏、成本增长和资产路径，而不仅是最后一个收益数字。",
          "但样本只有已经发生的一条历史路径。现存基金可能有幸存者偏差；市场制度、基金策略和管理人员变化也会削弱历史可比性。反复尝试很多持有期，再只挑最好看的结果，还会产生选择偏差。",
          "RT 默认不扣申赎费和税费，基金运作费通常已在净值中；定投费率只是固定比例近似。比较前应统一口径、历史范围和费用假设，再结合自身期限和承受损失的能力判断。",
        ],
        note: "结果可辅助研究与讨论，不是未来收益保证、自动买卖信号或个人投资建议。",
      },
      {
        label: "来源权利", title: "公开可读不代表可以再分发",
        paragraphs: [
          "目前没有确认上游授予历史净值的公开再分发许可。免费访问、无需密钥或开源适配代码，都不等于获得第三方数据版权和商业使用授权；本项目定位为个人研究工具。",
          "如需商业运营或扩大数据访问，应先取得权利人明确授权，或更换为许可范围清楚的数据服务。源的免责声明与接口说明是使用前应阅读的材料，不是已经取得授权的证明。",
          "上游可能改版、停服、漏记或修订历史记录。格式和数值校验只能发现部分异常，不能认证价格真实。失败时本站使用标明时间的旧数据，不用模拟价格冒充真实历史；重要结果仍应核对基金公司公告。",
        ],
        links: [
          { label: "来源免责声明", href: "https://fund.eastmoney.com/notbug.html" },
          { label: "数据与实现说明", href: "https://github.com/PeiyangFantasist/OpenRT/blob/main/docs/data-sources.md" },
        ],
      },
    ],
  },
];

export function MethodHelp() {
  const [selected, setSelected] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const topic = topics[selected];
  const page = topic.pages[pageIndex];

  return <section className="help-panel glass" aria-label="计算方法与数据说明">
    <nav className="help-topics" aria-label="帮助主题">
      {topics.map((item, index) => <button
        key={item.id}
        type="button"
        className={`help-topic${selected === index ? " active" : ""}`}
        aria-pressed={selected === index}
        aria-controls="method-help-content"
        onClick={() => { setSelected(index); setPageIndex(0); }}
      >{item.label}</button>)}
    </nav>
    <article className="help-content" id="method-help-content" aria-labelledby="method-help-title">
      <nav className="help-subtabs" aria-label={`${topic.label}小节`}>
        {topic.pages.map((item, index) => <button
          key={item.label}
          type="button"
          className={pageIndex === index ? "active" : ""}
          aria-pressed={pageIndex === index}
          onClick={() => setPageIndex(index)}
        >{item.label}</button>)}
      </nav>
      <h2 id="method-help-title">{page.title}</h2>
      <p>{page.paragraphs[0]}</p>
      {page.math?.map(tex => <MathFormula key={tex} tex={tex}/>)}
      {page.variables && <p className="help-variables">{page.variables.map((variable, index) => <Fragment key={variable.tex}>
        {index > 0 && "；"}<MathFormula tex={variable.tex} inline/>：{variable.description}
      </Fragment>)}</p>}
      {page.paragraphs.slice(1).map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      {page.example && <p className="help-example">{page.example}</p>}
      {page.note && <p className="help-note">{page.note}</p>}
      {page.links && <div className="help-links">{page.links.map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>}
      <div className="help-pager" aria-label="帮助翻页">
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex(value => value - 1)}>上一页</button>
        <span aria-live="polite">{pageIndex + 1} / {topic.pages.length}</span>
        <button type="button" disabled={pageIndex === topic.pages.length - 1} onClick={() => setPageIndex(value => value + 1)}>下一页</button>
      </div>
    </article>
  </section>;
}
