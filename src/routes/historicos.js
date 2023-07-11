const cron = require("node-cron");
const { Op } = require("sequelize");

module.exports = (app) => {
  const Historicos = app.db.models.Historicos;
  const Turnos = app.db.models.Turnos;

  // Ejecutar la funcion a las 20:00 de Lunes(1) a Sabados (6)
  cron.schedule("20 20 * * 1-6", () => {
    let hoyAhora = new Date();
    let diaHoy = hoyAhora.toString().slice(0, 3);
    let fullHoraAhora = hoyAhora.toString().slice(16, 21);

    console.log("Hoy es:", diaHoy, "la hora es:", fullHoraAhora);
    console.log("CRON: Se almacena el historico de los tickets enviados hoy");
    cantidadTicketsEnviados();
  });

  function cantidadTicketsEnviados() {
    // Fecha de hoy 2022-02-30
    let fechaHoy = new Date().toISOString().slice(0, 10);

    Turnos.count({
      where: {
        [Op.and]: [
          { estado_envio: 1 },
          {
            updatedAt: {
              [Op.between]: [fechaHoy + " 00:00:00", fechaHoy + " 23:59:59"],
            },
          },
        ],
      },
      //order: [["FECHA_CREACION", "DESC"]],
    })
      .then((result) => {
        let historicoObj = {
          fecha: fechaHoy,
          cant_enviados: result,
          cant_no_enviados: 0,
          user_id: 1,
        };

        console.log(historicoObj);

        Historicos.create(historicoObj)
          .then((result) => console.log('Se inserto la cant de envios de hoy en historico!'))
          //.catch((error) => console.log(error.detail));
          .catch((error) => console.log(error.message));
      })
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  }

  /**
   *
   *  METODOS
   *
   */

  app.route("/historicos").get((req, res) => {
    Historicos.findAll()
      .then((result) => res.json(result))
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  });
  // .post((req, res) => {
  //   Historicos.create(req.body)
  //     .then((result) => res.json(result))
  //     .catch((error) => res.json(error));
  // });

  // app
  //   .route("/roles/:role_id")
  //   .get((req, res) => {
  //     Roles.findOne({
  //       where: req.params,
  //     })
  //       .then((result) => res.json(result))
  //       .catch((error) => {
  //         res.status(404).json({
  //           msg: error.message,
  //         });
  //       });
  //   })
  //   .put((req, res) => {
  //     Roles.update(req.body, {
  //       where: req.params,
  //     })
  //       .then((result) => res.sendStatus(204))
  //       .catch((error) => {
  //         res.status(412).json({
  //           msg: error.message,
  //         });
  //       });
  //   })
  //   .delete((req, res) => {
  //     //const id = req.params.id;
  //     Roles.destroy({
  //       where: req.params,
  //     })
  //       .then(() => res.json(req.params))
  //       .catch((error) => {
  //         res.status(412).json({
  //           msg: error.message,
  //         });
  //       });
  //   });
};
