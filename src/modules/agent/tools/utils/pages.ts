import { CombineStatusEnum, COMBINE_STATUS_MAP } from 'src/types/types';

/**
 * 创建页面生成器的柯里化函数
 * @param type 业务类型
 * @param tagFormatter 标签格式化函数
 */
const createPageGenerator = (
  type: string,
  tagFormatter: (item: any) => string,
) => {
  return ({ json, listTitle }: { json: any; listTitle?: string }) => {
    let answer = listTitle ? `${listTitle}\n\n` : '';

    try {
      if (!json?.data) {
        if (json?.message) return { answer: json?.message };
        return { answer: '数据格式错误\n\n' };
      }

      const dataArray = json.data.list || [];

      if (Array.isArray(dataArray) && dataArray.length > 0) {
        dataArray.forEach((item) => {
          answer += tagFormatter(item) + '\n\n';
        });

        const pages = json.data.pages ?? 0;
        const pageNum = json.data.pageNum ?? 1;
        const total = json.data.total ?? 0;

        answer +=
          pages > 1
            ? `<pages title="${type}" pages="${pages}" pagenum="${pageNum}" total="${total}"></pages>`
            : '';
      } else {
        answer += '暂无数据\n\n';
      }
    } catch (error) {
      answer += '暂无数据或数据解析失败，请稍后重试\n\n';
    }

    return { answer };
  };
};

/**
 * 产品匹配页面生成器
 */
export const getProductMatchPages = createPageGenerator('产品匹配', (item) => {
  const corpName = item?.corpName || '未知企业';
  const creditNo = item?.taxNo || '';
  return `<g3 input="对企业${corpName}进行产品匹配" corpname="${corpName}" creditno="${creditNo}">${corpName}</g3>`;
});

/**
 * 营销商机页面生成器
 */
export const getMarketingOpportunityPages = createPageGenerator(
  '营销商机',
  (item) => {
    const corpName = item?.corpName || '未知企业';
    const creditNo = item?.taxNo || '';
    return `<g3 input="查看${corpName}报告详情" corpname="${corpName}" creditno="${creditNo}">${corpName}</g3>`;
  },
);

/**
 * 采集订单页面生成器
 */
export const getCollectionOrderPages = createPageGenerator(
  '查询采集订单',
  (item) => {
    const corpName = item?.corpName || '未知企业';
    const creditNo = item?.taxNo || '';
    const status = item?.combineStatus;
    const statusText =
      COMBINE_STATUS_MAP[status as CombineStatusEnum] || '未知状态';

    switch (status) {
      case CombineStatusEnum.NOT_LOGIN:
        return `<g3 input="获取采集链接" corpname="${corpName}" creditno="${creditNo}" status="${statusText}">${corpName}</g3>`;

      case CombineStatusEnum.COLLECTING:
        return `<g3 input="采集数据通常需要多久" corpname="${corpName}" creditno="${creditNo}" status="${statusText}">${corpName}</g3>`;

      case CombineStatusEnum.COMPLETED:
      case CombineStatusEnum.COMPLETED_ALT:
        return `<g3 input="对企业${corpName}报告进行解读" corpname="${corpName}" creditno="${creditNo}" status="${statusText}">${corpName}</g3>`;

      case CombineStatusEnum.FAILED:
        return `<g3 input="采集失败的原因有哪些？" corpname="${corpName}" creditno="${creditNo}" status="${statusText}">${corpName}</g3>`;

      default:
        return `<g3 input="采集失败的原因有哪些？" corpname="${corpName}" creditno="${creditNo}" status="${statusText}">${corpName}</g3>`;
    }
  },
);
