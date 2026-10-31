/** Known UI templates; captured values retain their original content. */
export const dynamicEnglish=[
  {
    "pattern": "^([\\s\\S]*?)说明$",
    "parts": [
      "",
      " details"
    ]
  },
  {
    "pattern": "^返回([\\s\\S]*?)$",
    "parts": [
      "Back to ",
      ""
    ]
  },
  {
    "pattern": "^当前仍显示\\s+([\\s\\S]*?)\\s+的上次结果。$",
    "parts": [
      "Previous results for  ",
      "  are still shown."
    ]
  },
  {
    "pattern": "^到期\\s+([\\s\\S]*?)\\s+·\\s+实际\\s+([\\s\\S]*?)\\s+天$",
    "parts": [
      "Maturity  ",
      " · actual  ",
      " days"
    ]
  },
  {
    "pattern": "^持有\\s+([\\s\\S]*?)\\s+个自然日$",
    "parts": [
      "Holding period:  ",
      "  calendar days"
    ]
  },
  {
    "pattern": "^非重叠\\s+([\\s\\S]*?)\\s+个$",
    "parts": [
      "Non-overlapping:  ",
      "  observations"
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+次投入$",
    "parts": [
      "",
      "  contributions"
    ]
  },
  {
    "pattern": "^费用\\s+([\\s\\S]*?)$",
    "parts": [
      "Fees  ",
      ""
    ]
  },
  {
    "pattern": "^收益\\s+([\\s\\S]*?)$",
    "parts": [
      "Return ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)与([\\s\\S]*?)相关性([\\s\\S]*?)$",
    "parts": [
      "",
      " and ",
      "Correlation",
      ""
    ]
  },
  {
    "pattern": "^滞后([\\s\\S]*?)，([\\s\\S]*?)$",
    "parts": [
      "Lag ",
      ", ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)，年化收益([\\s\\S]*?)，波动([\\s\\S]*?)$",
    "parts": [
      "",
      ", annual return ",
      ", volatility ",
      ""
    ]
  },
  {
    "pattern": "^移除([\\s\\S]*?)$",
    "parts": [
      "Remove ",
      ""
    ]
  },
  {
    "pattern": "^到期\\s+([\\s\\S]*?)$",
    "parts": [
      "Maturity  ",
      ""
    ]
  },
  {
    "pattern": "^确定（([\\s\\S]*?)）$",
    "parts": [
      "Confirm (",
      ")"
    ]
  },
  {
    "pattern": "^平均([\\s\\S]*?)收益$",
    "parts": [
      "Mean ",
      "Return"
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)收益标准差$",
    "parts": [
      "",
      " return standard deviation"
    ]
  },
  {
    "pattern": "^归一化尺度\\s+([\\s\\S]*?)。$",
    "parts": [
      "Normalization scales  ",
      "."
    ]
  },
  {
    "pattern": "^关闭([\\s\\S]*?)$",
    "parts": [
      "Close",
      ""
    ]
  },
  {
    "pattern": "^历史收益的平滑概率密度曲线，零收益左侧([\\s\\S]*?)，右侧([\\s\\S]*?)$",
    "parts": [
      "Smoothed historical return density; left of zero is ",
      ", right is ",
      ""
    ]
  },
  {
    "pattern": "^收益阈值\\s+([\\s\\S]*?)，密度每一个百分点\\s+([\\s\\S]*?)，历史累计占比\\s+([\\s\\S]*?)，([\\s\\S]*?)\\s+/\\s+([\\s\\S]*?)\\s+个窗口。$",
    "parts": [
      "Return threshold ",
      ", density per percentage point  ",
      ", empirical cumulative share  ",
      ", ",
      " / ",
      "  windows."
    ]
  },
  {
    "pattern": "^，累计投入\\s+([\\s\\S]*?)$",
    "parts": [
      ", contributions  ",
      ""
    ]
  },
  {
    "pattern": "^两支基金([\\s\\S]*?)对比：A\\s+([\\s\\S]*?)，B\\s+([\\s\\S]*?)。A\\s+为粗线，正收益红色、负收益绿色；B\\s+为细线，正收益蓝色、负收益黄色。$",
    "parts": [
      "Two funds: ",
      " comparison: A  ",
      ", B ",
      ". A uses a thick red/green line for positive/negative returns; B uses a thinner blue/yellow line."
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)在([\\s\\S]*?)指标较优$",
    "parts": [
      "",
      " in ",
      " has the better metric"
    ]
  },
  {
    "pattern": "^共同到期\\s+([\\s\\S]*?)\\s+·\\s+实际持有\\s+([\\s\\S]*?)\\s+天$",
    "parts": [
      "Shared maturity  ",
      " · Actual holding period  ",
      " days"
    ]
  },
  {
    "pattern": "^基金\\s+([\\s\\S]*?)\\s+查询$",
    "parts": [
      "Fund ",
      "  search"
    ]
  },
  {
    "pattern": "^基金\\s+([\\s\\S]*?)\\s+代码$",
    "parts": [
      "Fund ",
      "  code"
    ]
  },
  {
    "pattern": "^从收藏选择基金\\s+([\\s\\S]*?)$",
    "parts": [
      "Choose from favorites for fund  ",
      ""
    ]
  },
  {
    "pattern": "^刷新基金\\s+([\\s\\S]*?)$",
    "parts": [
      "Refresh fund  ",
      ""
    ]
  },
  {
    "pattern": "^仍显示\\s+([\\s\\S]*?)\\s+的上次结果。$",
    "parts": [
      "Still showing  ",
      "  are still shown."
    ]
  },
  {
    "pattern": "^关闭基金\\s+([\\s\\S]*?)\\s+错误$",
    "parts": [
      "Dismiss fund  ",
      "  error"
    ]
  },
  {
    "pattern": "^·\\s+投入\\s+¥([\\s\\S]*?)$",
    "parts": [
      "· Contributions ¥",
      ""
    ]
  },
  {
    "pattern": "^·\\s+完整窗口\\s+([\\s\\S]*?)\\s+个$",
    "parts": [
      "· Complete windows  ",
      "  observations"
    ]
  },
  {
    "pattern": "^最晚起投\\s+([\\s\\S]*?)$",
    "parts": [
      "Latest entry  ",
      ""
    ]
  },
  {
    "pattern": "^实际结算\\s+([\\s\\S]*?)$",
    "parts": [
      "Actual valuation  ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)只基金暂时无法读取$",
    "parts": [
      "",
      " funds could not be loaded"
    ]
  },
  {
    "pattern": "^收藏预警\\s+·\\s+([\\s\\S]*?)$",
    "parts": [
      "Watchlist alerts ·  ",
      ""
    ]
  },
  {
    "pattern": "^上涨\\s+([\\s\\S]*?)\\s+·\\s+下跌\\s+([\\s\\S]*?)\\s+·\\s+持平\\s+([\\s\\S]*?)。([\\s\\S]*?)。$",
    "parts": [
      "Up  ",
      " · Down  ",
      " · Flat  ",
      ". ",
      "."
    ]
  },
  {
    "pattern": "^净值\\s+([\\s\\S]*?)$",
    "parts": [
      "NAV  ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)小节$",
    "parts": [
      "",
      " sections"
    ]
  },
  {
    "pattern": "^修改([\\s\\S]*?)收藏名称$",
    "parts": [
      "Edit ",
      "Favorite name"
    ]
  },
  {
    "pattern": "^打开([\\s\\S]*?)$",
    "parts": [
      "Open ",
      ""
    ]
  },
  {
    "pattern": "^已清理\\s+([\\s\\S]*?)\\s+项行情缓存$",
    "parts": [
      "Removed  ",
      "  market cache entries"
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)项待净值执行$",
    "parts": [
      "",
      " orders awaiting NAV"
    ]
  },
  {
    "pattern": "^净值截至\\s+([\\s\\S]*?)$",
    "parts": [
      "NAV through  ",
      ""
    ]
  },
  {
    "pattern": "^·\\s+预算\\s+¥([\\s\\S]*?)$",
    "parts": [
      "· Budget ¥",
      ""
    ]
  },
  {
    "pattern": "^当日收益\\s+¥([\\s\\S]*?)$",
    "parts": [
      "Daily profit ¥",
      ""
    ]
  },
  {
    "pattern": "^累计\\s+¥([\\s\\S]*?)$",
    "parts": [
      "Cumulative ¥",
      ""
    ]
  },
  {
    "pattern": "^投入\\s+¥([\\s\\S]*?)\\s+·\\s+市值\\s+¥([\\s\\S]*?)$",
    "parts": [
      "Contributions ¥",
      " · Value ¥",
      ""
    ]
  },
  {
    "pattern": "^无效日期：([\\s\\S]*?)$",
    "parts": [
      "Invalid date: ",
      ""
    ]
  },
  {
    "pattern": "^日期超出已公布净值范围（([\\s\\S]*?)\\s+至\\s+([\\s\\S]*?)）。请使用已公布的历史日期。$",
    "parts": [
      "Dates exceed the published NAV range (",
      "  to  ",
      "). Use published historical dates."
    ]
  },
  {
    "pattern": "^无效比较日期：([\\s\\S]*?)$",
    "parts": [
      "Invalid comparison date: ",
      ""
    ]
  },
  {
    "pattern": "^基金比较的净值必须为有效正数：([\\s\\S]*?)$",
    "parts": [
      "Comparison NAVs must be valid positive numbers: ",
      ""
    ]
  },
  {
    "pattern": "^基金比较包含同日冲突净值：([\\s\\S]*?)$",
    "parts": [
      "Conflicting NAVs on the same comparison date: ",
      ""
    ]
  },
  {
    "pattern": "^刷新失败，正在显示旧缓存（抓取于\\s+([\\s\\S]*?)）。([\\s\\S]*?)$",
    "parts": [
      "Refresh failed. Showing a stale cache fetched at  ",
      "). ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+暂无可用缓存，请稍后重试或选择已收录的基金。$",
    "parts": [
      "",
      " No usable cache is available. Retry later or choose a cached fund."
    ]
  },
  {
    "pattern": "^发现\\s+([\\s\\S]*?)\\s+处未标记的净值与日增长率显著不一致。$",
    "parts": [
      "Detected  ",
      "  unmarked discrepancies between NAV and daily growth."
    ]
  },
  {
    "pattern": "^发现\\s+([\\s\\S]*?)\\s+处无法识别的源事件说明，未将任意文字当作分红或拆分。$",
    "parts": [
      "Detected  ",
      "  unrecognized event notes; arbitrary text was not treated as a distribution or split."
    ]
  },
  {
    "pattern": "^按源事件标记及其日增长率近似校正了\\s+([\\s\\S]*?)\\s+次分红或拆分。日增长率有舍入误差，这不是官方认证复权净值；分红再投资的实际确认日可能不同。$",
    "parts": [
      "Approximately adjusted  ",
      "  distributions or splits using source event labels and daily growth. Rounded growth rates introduce error; this is not officially certified adjusted NAV, and actual reinvestment confirmation dates may differ."
    ]
  },
  {
    "pattern": "^最新净值距抓取时间已有\\s+([\\s\\S]*?)\\s+个自然日；可能为假期、暂停披露或源未更新。$",
    "parts": [
      "The latest NAV precedes the fetch date by  ",
      "  calendar days; holidays, suspended disclosure or an unchanged source may explain the gap."
    ]
  },
  {
    "pattern": "^基金数据源暂不可用（HTTP\\s+([\\s\\S]*?)）。$",
    "parts": [
      "Fund data source unavailable (HTTP  ",
      ")."
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+存在无效净值。$",
    "parts": [
      "",
      " Invalid NAV detected."
    ]
  },
  {
    "pattern": "^组合估计至少需要\\s+([\\s\\S]*?)\\s+个共同收益样本；请扩大窗口。$",
    "parts": [
      "Portfolio estimation requires at least  ",
      "  shared return observations. Expand the window."
    ]
  },
  {
    "pattern": "^风险平价未收敛（风险份额误差\\s+([\\s\\S]*?)），未输出最优权重。$",
    "parts": [
      "Risk parity did not converge (risk-share error  ",
      "). No optimal weights were reported."
    ]
  },
  {
    "pattern": "^高级优化未达到精度要求（归一化目标间隙\\s+([\\s\\S]*?)），未输出最优权重。$",
    "parts": [
      "Advanced optimization did not meet precision (normalized objective gap  ",
      "). No optimal weights were reported."
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+使用旧缓存。$",
    "parts": [
      "",
      " Using a stale cache."
    ]
  },
  {
    "pattern": "^预算不能低于已承诺模拟投入\\s+([\\s\\S]*?)\\s+元。$",
    "parts": [
      "The budget cannot be below committed paper contributions of  ",
      "  CNY."
    ]
  },
  {
    "pattern": "^API\\s+请求失败（([\\s\\S]*?)）([\\s\\S]*?)$",
    "parts": [
      "API request failed (",
      ")",
      ""
    ]
  },
  {
    "pattern": "^未知参数：([\\s\\S]*?)$",
    "parts": [
      "Unknown parameter: ",
      ""
    ]
  },
  {
    "pattern": "^缺少参数：([\\s\\S]*?)$",
    "parts": [
      "Missing parameter: ",
      ""
    ]
  },
  {
    "pattern": "^无效参数：([\\s\\S]*?)$",
    "parts": [
      "Invalid parameter: ",
      ""
    ]
  },
  {
    "pattern": "^无效数值：([\\s\\S]*?)$",
    "parts": [
      "Invalid number: ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+·\\s+分析窗口累计收益$",
    "parts": [
      "",
      " · Analysis-window cumulative return"
    ]
  },
  {
    "pattern": "^RT-α\\s+对比\\s+·\\s+([\\s\\S]*?)天$",
    "parts": [
      "RT-α comparison ·  ",
      "days"
    ]
  },
  {
    "pattern": "^单位净值\\s+([\\s\\S]*?)$",
    "parts": [
      "Unit NAV ",
      ""
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+·\\s+定投$",
    "parts": [
      "",
      " · DCA"
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+·\\s+收益密度$",
    "parts": [
      "",
      " · Return density"
    ]
  },
  {
    "pattern": "^([\\s\\S]*?)\\s+·\\s+RT-([\\s\\S]*?)天$",
    "parts": [
      "",
      " · RT-",
      "days"
    ]
  },
  {
    "pattern": "^到期\\s+([\\s\\S]*?)\\s+·\\s+([\\s\\S]*?)天$",
    "parts": [
      "Maturity  ",
      " · ",
      "days"
    ]
  }
].sort((a,b)=>(b.pattern.match(/\p{Script=Han}/gu)?.length??0)-(a.pattern.match(/\p{Script=Han}/gu)?.length??0)).map(rule=>({...rule,pattern:new RegExp(rule.pattern,'u')}));
