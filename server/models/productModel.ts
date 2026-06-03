import { prisma } from '../lib/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';
import { createProductInput, updateProductInput } from '../types/product.type.js';
import { pool } from '../config/database.js';

// get products with pagination and filter
const getProductsPaginationFilter = async (
  page: number,
  limit: number,
  search?: string | null,
  category?: number | null,
  status?: boolean | null
) => {
  try {
    // Use stored procedure to maintain original functionality
    const query = `
      SELECT * FROM get_products_with_pagination(
      $1::INT, 
      $2::INT,
      $3::TEXT,
      $4::BIGINT,
      $5::BOOLEAN
      );`;
    const params = [page, limit, search, category, status];
    const result = await pool().query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error in getProductsPaginationFilter:', error);
    throw new Error('Error fetching products with pagination and filter');
  }
};

// get total pages for pagination
const getTotalCount = async (search?: string | null, category?: number | null, status?: boolean | null) => {
  try {
    // Build filter conditions
    const where: any = {};
    if (search) {
      where.productName = { contains: search, mode: 'insensitive' };
    }
    if (category != null) {
      where.productCategoryId = BigInt(category);
    }
    if (status != null) {
      where.productIsEnabled = status;
    }

    const count = await prisma.product.count({ where });
    return count;
  } catch (error) {
    console.error('Error in getTotalPages:', error);
    throw new Error('Error fetching total number of pages');
  }
};

// get product by id, include both enabled and disabled products
const getProductById = async (id: number) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: BigInt(id) },
      include: {
        productCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });
    return product;
  } catch (error) {
    console.error('Error fetching product by id:', error);
    throw new Error('Error fetching product by id');
  }
};

// get product by name
const getProductByName = async (product_name: string) => {
  try {
    const product = await prisma.product.findFirst({
      where: { productName: product_name },
      select: {
        id: true,
        productName: true,
      },
    });
    return product;
  } catch (error) {
    console.error('Error fetching product by name:', error);
    throw new Error('Error fetching product by name');
  }
};

// get products by category id
const getProductByCategory = async (product_category_id: number) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        productCategoryId: BigInt(product_category_id),
        productIsEnabled: true,
      },
      select: {
        id: true,
        productName: true,
        productSequenceNo: true,
      },
      orderBy: {
        productSequenceNo: 'asc',
      },
    });
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error('Error fetching products');
  }
};

// get product sequence number by counting products that are enabled and in same category
const getProductSequenceNo = async (product_category_id: string | number): Promise<number> => {
  try {
    const count = await prisma.product.count({
      where: {
        productCategoryId: BigInt(product_category_id),
        productIsEnabled: true,
      },
    });
    return count + 1;
  } catch (error) {
    console.error('Error fetching product sequence no:', error);
    throw new Error('Error fetching product sequence no');
  }
};

// create product
const createProduct = async ({
  product_name,
  product_description,
  product_remarks,
  product_unit_sale_price,
  product_unit_cost_price,
  product_is_enabled,
  created_at,
  updated_at,
  product_category_id,
  product_sequence_no,
  created_by,
  updated_by,
}: createProductInput) => {
  try {
    // Build data object with optional fields
    const createData: any = {
      productName: product_name,
      productDescription: product_description,
      productRemarks: product_remarks,
      productUnitSalePrice: new Decimal(product_unit_sale_price),
      productUnitCostPrice: new Decimal(product_unit_cost_price),
      productIsEnabled: product_is_enabled,
      createdAt: new Date(created_at),
      updatedAt: new Date(updated_at),
      productCategoryId: BigInt(product_category_id),
      productSequenceNo: product_sequence_no,
    };

    // Only add these fields if they have values
    if (created_by) {
      createData.createdBy = BigInt(created_by);
    }
    if (updated_by) {
      createData.updatedBy = BigInt(updated_by);
    }

    const product = await prisma.product.create({
      data: createData,
      include: {
        productCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });
    return [product];
  } catch (error) {
    console.error('Error creating new product:', error);
    throw new Error('Error creating new product');
  }
};

// update product
const updateProduct = async ({
  id,
  product_name,
  product_description,
  product_remarks,
  product_unit_sale_price,
  product_unit_cost_price,
  created_at,
  updated_at,
  product_category_id,
  product_sequence_no,
  created_by,
  updated_by,
}: Partial<updateProductInput>) => {
  try {
    const updateData: any = {};

    if (product_name) {
      updateData.productName = product_name;
    }

    if (product_description != null) {
      updateData.productDescription = product_description;
    }

    if (product_remarks != null) {
      updateData.productRemarks = product_remarks;
    }

    if (product_unit_sale_price) {
      updateData.productUnitSalePrice = new Decimal(product_unit_sale_price);
    }

    if (product_unit_cost_price) {
      updateData.productUnitCostPrice = new Decimal(product_unit_cost_price);
    }

    if (product_category_id) {
      updateData.productCategoryId = BigInt(product_category_id);
      if (product_sequence_no) {
        updateData.productSequenceNo = product_sequence_no;
      }
    }

    if (created_at) {
      updateData.createdAt = new Date(created_at);
    }

    if (created_by) {
      updateData.createdBy = BigInt(created_by);
    }

    // Always update updated_at and updated_by
    updateData.updatedAt = new Date(updated_at || new Date().toISOString());
    updateData.updatedBy = BigInt(updated_by || 0);

    const product = await prisma.product.update({
      where: { id: BigInt(id || 0) },
      data: updateData,
      include: {
        productCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });

    return [product];
  } catch (error) {
    console.error('Error updating product:', error);
    throw new Error('Error updating product');
  }
};

// reorder product
const reorderProducts = async (products: { id: number; product_sequence_no: number }[]) => {
  try {
    for (const product of products) {
      await prisma.product.update({
        where: { id: BigInt(product.id) },
        data: { productSequenceNo: product.product_sequence_no },
      });
    }
    return { success: true, updatedCount: products.length };
  } catch (error) {
    console.error('Error updating product sequence:', error);
    throw new Error('Error updating product sequence');
  }
};

// enable/disable product by id
const changeProductStatus = async (updateData: {
  id: number;
  enabled: boolean;
  updated_at: string;
  updated_by: number;
  product_sequence_no: number;
  product_remarks?: string | null;
}) => {
  try {
    const updatePayload: any = {
      productIsEnabled: updateData.enabled,
      productSequenceNo: updateData.product_sequence_no,
      updatedBy: BigInt(updateData.updated_by),
      updatedAt: new Date(updateData.updated_at),
    };

    if (updateData.product_remarks) {
      updatePayload.productRemarks = updateData.product_remarks;
    }

    const product = await prisma.product.update({
      where: { id: BigInt(updateData.id) },
      data: updatePayload,
      include: {
        productCategory: true,
        createdByEmployee: true,
        updatedByEmployee: true,
      },
    });
    return product;
  } catch (error) {
    console.error('Error changing product status:', error);
    throw new Error('Error changing product status');
  }
};

// PRODUCT CATEGORIES
const getProductCategories = async () => {
  try {
    const categories = await prisma.productCategory.findMany({
      include: {
        products: {
          select: { id: true },
        },
      },
      orderBy: {
        productCategorySequenceNo: 'asc',
      },
    });

    return categories.map((cat: any) => ({
      ...cat,
      total_products: cat.products.length,
    }));
  } catch (error) {
    console.error('Error fetching product categories:', error);
    throw new Error('Error fetching product categories');
  }
};

const getProductCategoryById = async (id: number) => {
  try {
    const category = await prisma.productCategory.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        productCategoryName: true,
      },
    });
    return category;
  } catch (error) {
    console.error('Error fetching product category by id:', error);
    throw new Error('Error fetching product category by id');
  }
};

// create a new product category
const createProductCategory = async (name: string) => {
  try {
    // Use stored procedure to maintain original functionality and error handling
    const query = `SELECT * FROM create_product_category($1)`;
    const result = await pool().query(query, [name]);
    return result.rows;
  } catch (error) {
    console.error('Error creating product category:', error);

    if (error instanceof Error && error.message.includes('Category already exists')) {
      throw new Error('Category already exists');
    }

    throw new Error('Error creating product category');
  }
};

// update product category by id
const updateProductCategory = async (id: number, name: string) => {
  try {
    // Use stored procedure to maintain original functionality and error handling
    const result = await pool().query('SELECT * FROM update_product_category($1, $2)', [id, name]);
    return result.rows;
  } catch (error) {
    console.error('Error updating product category:', error);

    if (error instanceof Error && error.message.includes('does not exist')) {
      throw new Error('Category not found');
    }

    if (error instanceof Error && error.message.includes('already exists')) {
      throw new Error('Category already exists');
    }

    throw new Error('Error updating product category');
  }
};

// reorder product category sequence no
const reorderProductCategory = async (categories: { id: number; product_category_sequence_no: number }[]) => {
  try {
    for (const { id, product_category_sequence_no } of categories) {
      await prisma.productCategory.update({
        where: { id: BigInt(id) },
        data: {
          productCategorySequenceNo: product_category_sequence_no,
          updatedAt: new Date(),
        },
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error reordering product categories:', error);
    throw new Error('Error reordering product categories');
  }
};

// get sales history by product id, selected month and year
const getSalesHistoryByProductId = async (id: number, month: number, year: number) => {
  try {
    // Use stored procedure to maintain original functionality
    const salesQuery = `SELECT * FROM get_sales_history_for_each_product($1, $2, $3);`;
    const result = await pool().query(salesQuery, [id, year, month]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching sales history by product ID:', error);
    throw new Error('Error fetching sales history');
  }
};

// get total pages for pagination
const getProductCategoriesCount = async (search: string | null) => {
  try {
    const where: any = {};
    if (search != null) {
      where.productCategoryName = { contains: search, mode: 'insensitive' };
    }

    const count = await prisma.productCategory.count({ where });
    return count;
  } catch (error) {
    console.error('Error in getProductCategoriesCount:', error);
    throw new Error('Error fetching category count');
  }
};

// Get product categories with pagination and search filter
const getProductCategoriesPaginationFilter = async (
  page: number,
  limit: number,
  search: string | null
) => {
  try {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search != null) {
      where.productCategoryName = { contains: search, mode: 'insensitive' };
    }

    const categories = await prisma.productCategory.findMany({
      where,
      skip,
      take: limit,
      include: {
        products: {
          select: { id: true },
        },
      },
      orderBy: {
        productCategorySequenceNo: 'asc',
      },
    });

    return categories.map((cat: any) => ({
      ...cat,
      total_products: cat.products.length,
    }));
  } catch (error) {
    console.error('Error in getProductCategoriesPaginationFilter:', error);
    throw new Error('Error fetching product categories with pagination');
  }
};

export default {
  getProductsPaginationFilter,
  getTotalCount,
  getProductById,
  getProductByName,
  getProductByCategory,
  getProductSequenceNo,
  createProduct,
  updateProduct,
  reorderProducts,
  changeProductStatus,
  getProductCategories,
  getProductCategoryById,
  createProductCategory,
  updateProductCategory,
  reorderProductCategory,
  getSalesHistoryByProductId,
  getProductCategoriesCount,
  getProductCategoriesPaginationFilter
};
