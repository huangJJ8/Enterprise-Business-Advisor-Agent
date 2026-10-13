/**
 * 分页查询参数接口
 */
export interface PaginationParams {
  /** 当前页码，从1开始 */
  page?: number;
  /** 每页数量 */
  pageSize?: number;
  /** 默认每页数量 */
  defaultPageSize?: number;
  /** 最大每页数量限制 */
  maxPageSize?: number;
}

/**
 * 分页结果接口
 */
export interface PaginationResult<T> {
  /** 数据列表 */
  list: T[];
  /** 总记录数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 总页数 */
  totalPages: number;
  /** 是否有上一页 */
  hasPrev: boolean;
  /** 是否有下一页 */
  hasNext: boolean;
}

/**
 * Prisma 分页查询选项
 */
export interface PrismaPaginationOptions<T = any> {
  /** where 条件 */
  where?: T;
  /** select 字段 */
  select?: any;
  /** 排序 */
  orderBy?: any;
  /** include 关联查询 */
  include?: any;
}

/**
 * 解析并验证分页参数
 * @param params 分页参数
 * @returns 处理后的分页参数
 */
export function parsePaginationParams(
  params: PaginationParams = {},
): Required<Pick<PaginationParams, 'page' | 'pageSize'>> {
  const {
    page = 1,
    pageSize = params.defaultPageSize || 10,
    maxPageSize = 100,
  } = params;

  // 确保页码至少为1
  const validPage = Math.max(1, Math.floor(Number(page) || 1));

  // 确保每页数量在合理范围内
  const validPageSize = Math.min(
    Math.max(1, Math.floor(Number(pageSize) || 10)),
    maxPageSize,
  );

  return {
    page: validPage,
    pageSize: validPageSize,
  };
}

/**
 * 计算分页的 skip 和 take
 * @param page 页码
 * @param pageSize 每页数量
 * @returns { skip, take }
 */
export function calculatePaginationOffset(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * 构建分页结果
 * @param list 数据列表
 * @param total 总记录数
 * @param page 当前页码
 * @param pageSize 每页数量
 * @returns 分页结果对象
 */
export function buildPaginationResult<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    list,
    total,
    page,
    pageSize,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * 通用 Prisma 分页查询函数
 * 适用于任何 Prisma model
 *
 * @example
 * ```typescript
 * // 基础用法
 * const result = await paginateQuery(
 *   prisma.note,
 *   { page: 1, pageSize: 10 },
 *   { where: { public: true } }
 * );
 *
 * // 带排序和字段选择
 * const result = await paginateQuery(
 *   prisma.user,
 *   { page: 2, pageSize: 20 },
 *   {
 *     where: { status: 'active' },
 *     select: { id: true, name: true },
 *     orderBy: { createdAt: 'desc' }
 *   }
 * );
 * ```
 *
 * @param model Prisma model 实例（如 prisma.note, prisma.user）
 * @param params 分页参数
 * @param options Prisma 查询选项（where, select, orderBy, include 等）
 * @returns 分页结果
 */
export async function paginateQuery<T = any>(
  model: any,
  params: PaginationParams = {},
  options: PrismaPaginationOptions = {},
): Promise<PaginationResult<T>> {
  const { page, pageSize } = parsePaginationParams(params);
  const { skip, take } = calculatePaginationOffset(page, pageSize);

  const { where, select, orderBy, include } = options;

  // 构建查询选项
  const queryOptions: any = {
    where,
    skip,
    take,
  };

  // 根据传入的选项决定使用 select 还是 include
  if (select) {
    queryOptions.select = select;
  }
  if (include) {
    queryOptions.include = include;
  }
  if (orderBy) {
    queryOptions.orderBy = orderBy;
  }

  // 并行执行查询和计数
  const [list, total] = await Promise.all([
    model.findMany(queryOptions),
    model.count({ where }),
  ]);

  return buildPaginationResult<T>(list, total, page, pageSize);
}

/**
 * 自定义分页查询函数
 * 适用于需要自定义查询逻辑的场景
 *
 * @example
 * ```typescript
 * const result = await paginateCustomQuery(
 *   { page: 1, pageSize: 10 },
 *   async (skip, take) => {
 *     // 自定义查询逻辑
 *     return await customQuery(skip, take);
 *   },
 *   async () => {
 *     // 自定义计数逻辑
 *     return await customCount();
 *   }
 * );
 * ```
 *
 * @param params 分页参数
 * @param queryFn 查询函数，接收 skip 和 take 参数
 * @param countFn 计数函数
 * @returns 分页结果
 */
export async function paginateCustomQuery<T = any>(
  params: PaginationParams,
  queryFn: (skip: number, take: number) => Promise<T[]>,
  countFn: () => Promise<number>,
): Promise<PaginationResult<T>> {
  const { page, pageSize } = parsePaginationParams(params);
  const { skip, take } = calculatePaginationOffset(page, pageSize);

  // 并行执行查询和计数
  const [list, total] = await Promise.all([queryFn(skip, take), countFn()]);

  return buildPaginationResult<T>(list, total, page, pageSize);
}

/**
 * 数组分页函数
 * 用于对已有数组进行分页处理
 *
 * @example
 * ```typescript
 * const allItems = [1, 2, 3, ..., 100];
 * const result = paginateArray(allItems, { page: 2, pageSize: 10 });
 * ```
 *
 * @param array 要分页的数组
 * @param params 分页参数
 * @returns 分页结果
 */
export function paginateArray<T = any>(
  array: T[],
  params: PaginationParams = {},
): PaginationResult<T> {
  const { page, pageSize } = parsePaginationParams(params);
  const { skip, take } = calculatePaginationOffset(page, pageSize);

  const list = array.slice(skip, skip + take);
  const total = array.length;

  return buildPaginationResult<T>(list, total, page, pageSize);
}
