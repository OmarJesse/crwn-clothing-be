import { Model, DataTypes } from "sequelize";
import sequelize from "./sequelize";

class Product extends Model {
  public id!: string;
  public name!: string;
  public price!: number;
  public description!: string;
  public stock!: number;
  public imageUrl!: string;
  public categoryId!: string;
  public fitType!: string | null;
  public gender!: "men" | "women" | "unisex" | null;
  public sizeChartJson!: unknown;
  public recommendationTags!: string[] | null;
}

Product.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: sequelize.literal("uuid_generate_v4()"),
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stock: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "categories",
        key: "id",
      },
    },
    fitType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "unisex",
    },
    sizeChartJson: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    recommendationTags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
  },
  {
    sequelize,
    tableName: "products",
    
  }
);

export default Product;
