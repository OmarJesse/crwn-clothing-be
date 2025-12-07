import { Model, DataTypes } from "sequelize";
import sequelize from "./sequelize";

class Category extends Model {
  public id!: string;
  public name!: string;
}

Category.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      unique: true,
      defaultValue: sequelize.literal("uuid_generate_v4()"),
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "categories",
  }
);
export default Category;
