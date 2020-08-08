module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('teams', 'office365Id', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true
    });
    await queryInterface.addIndex('teams', ['office365Id']);
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('teams', 'office365Id');
    await queryInterface.removeIndex('teams', ['office365Id']);
  }
}