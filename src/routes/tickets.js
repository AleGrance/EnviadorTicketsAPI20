const { Op } = require("sequelize");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
// Para crear la imagen
const { createCanvas, loadImage } = require("canvas");
// Conexion con firebird
var Firebird = require("node-firebird");

// Conexion con JKMT
var odontos = {};

odontos.host = "192.168.10.247";
odontos.port = 3050;
odontos.database = "c:\\\\jakemate\\\\base\\\\ODONTOS64.fdb";
odontos.user = "SYSDBA";
odontos.password = "masterkey";
odontos.lowercase_keys = false; // set to true to lowercase keys
odontos.role = null; // default
odontos.retryConnectionInterval = 1000; // reconnect interval in case of connection drop
odontos.blobAsText = false;

// Dimensiones del ticket
const width = 1080;
const height = 1080;

// Instantiate the canvas object
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");

// Logo de odontos
const imagePath = path.join(
  __dirname,
  "..",
  "assets",
  "img",
  "odontos_background.jpeg"
);

// Datos del Mensaje de whatsapp
let mensajePie = `Se ha registrado su turno! 😁
Para cualquier consulta, contáctanos llamando al 0214129000 o escribinos al siguiente link:
https://wa.me/595214129000`;
let fileMimeTypeMedia = "image/png";
let fileBase64Media = "";
let mensajeBody = "";

// Var para la conexion a WWA Free
const wwaUrl = "http://localhost:3001/lead";

// Tiempo de retraso de consulta al PGSQL para iniciar el envio. 1 minuto
var tiempoRetrasoPGSQL = 10000;
// Tiempo entre envios. Cada 15s se realiza el envío a la API free WWA
var tiempoRetrasoEnvios = 15000;

module.exports = (app) => {
  /**
   * 
   *  YA SE PUEDE INSTALAR Y USAR
   *  FALTARIA AGREGAR LA FUNCION QUE GUARDA EL HISTORICO
   * 
   */
  const Tickets = app.db.models.Tickets;
  const Users = app.db.models.Users;

  // Ejecutar la funcion cada 10min de 07:00 a 19:59 de Lunes(1) a Sabados (6)
  cron.schedule("*/10 7-19 * * 1-6", () => {
    let hoyAhora = new Date();
    let diaHoy = hoyAhora.toString().slice(0, 3);
    let fullHoraAhora = hoyAhora.toString().slice(16, 21);

    console.log("Hoy es:", diaHoy, "la hora es:", fullHoraAhora);
    console.log("CRON: Se consulta al JKMT turnos de hoy");
    //injeccionFirebird();
  });

  // Trae los turnos del JKMT al PGSQL
  function injeccionFirebird() {
    Firebird.attach(odontos, function (err, db) {
      if (err) throw err;

      // db = DATABASE
      db.query(
        // Trae los ultimos 50 registros de turnos del JKMT
        "SELECT * FROM VW_RESUMEN_TURNOS_HOY ROWS 5",
        //"SELECT COUNT(*) FROM VW_RESUMEN_TURNOS_HOY",
        function (err, result) {
          console.log("Cant de turnos obtenidos del JKMT:", result.length);

          // Recorre el array que contiene los datos e inserta en la base de postgresql
          result.forEach((e) => {
            // Si el nro de cert trae NULL cambiar por 000000
            if (!e.NRO_CERT) {
              e.NRO_CERT = " ";
            }
            // Si no tiene plan
            if (!e.PLAN_CLIENTE) {
              e.PLAN_CLIENTE = " ";
            }
            // Si la hora viene por ej: 11:0 entonces agregar el 0 al final
            if (e.HORA[3] === "0") {
              e.HORA = e.HORA + "0";
            }
            // Si la hora viene por ej: 10:3 o 11:2 entonces agregar el 0 al final
            if (e.HORA.length === 4 && e.HORA[0] === "1") {
              e.HORA = e.HORA + "0";
            }
            // Si el nro de tel trae NULL cambiar por 595000 y cambiar el estado a 2
            // Si no reemplazar el 0 por el 595
            // if (!e.TELEFONO_MOVIL) {
            //   e.TELEFONO_MOVIL = "595000";
            //   e.estado_envio = 2;
            // } else {
            //   e.TELEFONO_MOVIL = e.TELEFONO_MOVIL.replace(0, "595");
            // }

            // Reemplazar por mi nro para probar el envio
            if (!e.TELEFONO_MOVIL) {
              e.TELEFONO_MOVIL = "595000";
              e.estado_envio = 2;
            } else {
              e.TELEFONO_MOVIL = "595986153301";
            }

            // Poblar PGSQL
            Tickets.create(e)
              //.then((result) => res.json(result))
              .catch((error) => console.log(error.message));
          });

          // IMPORTANTE: cerrar la conexion
          db.detach();
          console.log(
            "Llama a la funcion iniciar envio que se retrasa 1 min en ejecutarse Tickets"
          );
        }
      );
    });
  }

  // Inicia los envios - Consulta al PGSQL
  let losTurnos = [];
  function iniciarEnvio() {
    setTimeout(() => {
      Tickets.findAll({
        where: { estado_envio: 0 },
        order: [["createdAt", "DESC"]],
      })
        .then((result) => {
          losTurnos = result;
          console.log("Enviando tickets:", losTurnos.length);
        })
        .then(() => {
          enviarMensaje();
        })
        .catch((error) => {
          res.status(402).json({
            msg: error.menssage,
          });
        });
    }, tiempoRetrasoPGSQL);
  }

  iniciarEnvio();

  // Envia los mensajes
  let retraso = () => new Promise((r) => setTimeout(r, tiempoRetrasoEnvios));
  async function enviarMensaje() {
    console.log("Inicia el recorrido del for para enviar los tickets");
    for (let i = 0; i < losTurnos.length; i++) {
      const turnoId = losTurnos[i].id_turno;
      //mensajePieCompleto = losTurnos[i].CLIENTE + mensajePie;

      // Dibuja el ticket
      loadImage(imagePath)
        .then((image) => {
          // Dibuja la imagen de fondo
          context.drawImage(image, 0, 0, width, height);

          // Los textos que se agregan
          context.font = "bold 40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].CLIENTE, 50, 250);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].PLAN_CLIENTE, 50, 350);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].NRO_CERT, 50, 400);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("FECHA DEL TURNO", 50, 480);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].FECHA, 50, 530);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("HORA DEL TURNO", 50, 580);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].HORA, 50, 630);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("Sucursal:", 50, 730);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].SUCURSAL, 230, 730);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("Direccion:", 50, 780);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].DIRECCION, 50, 830);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("Tel:", 50, 880);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("021-412-9000", 130, 880);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("Prof:", 50, 930);

          context.font = "40px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText(losTurnos[i].NOMBRE_COMERCIAL, 150, 930);

          context.font = "20px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("ATENCIÓN: El turno debe ser Re confirmado con 24Hs de anticipación, en caso de no hacerlo el turno queda ", 50, 1000);

          context.font = "20px Arial";
          context.fillStyle = "#34495E";
          context.textAlign = "left";
          context.fillText("disponible para otro paciente. Para Re confirmar: 021-412-9000", 50, 1025);

          // Escribe la imagen a archivo
          const buffer = canvas.toBuffer("image/png");
          fs.writeFileSync("./imagen.png", buffer);
          //fs.writeFileSync("./" + losTurnos[i].CLIENTE + ".png", buffer);

          // Convierte el canvas en una imagen base64
          const base64Image = canvas.toDataURL();
          fileBase64Media = base64Image.split(",")[1];
        })
        .then(() => {
          mensajeBody = {
            message: mensajePie,
            phone: losTurnos[i].TELEFONO_MOVIL,
            mimeType: fileMimeTypeMedia,
            data: fileBase64Media,
            fileName: "",
            fileSize: "",
          };

          //console.log(mensajeBody);
        })
        .then(() => {
          // Funcion ajax para nodejs que realiza los envios a la API free WWA
          axios
            .post(wwaUrl, mensajeBody)
            .then((response) => {
              const data = response.data;

              if (data.responseExSave.id) {
                console.log("Enviado - OK");
                // Se actualiza el estado a 1
                const body = {
                  estado_envio: 1,
                };

                Tickets.update(body, {
                  where: { id_turno: turnoId },
                })
                  //.then((result) => res.json(result))
                  .catch((error) => {
                    res.status(412).json({
                      msg: error.message,
                    });
                  });
              }

              if (data.responseExSave.unknow) {
                console.log("No Enviado - unknow");
                // Se actualiza el estado a 3
                const body = {
                  estado_envio: 3,
                };

                Tickets.update(body, {
                  where: { id_turno: turnoId },
                })
                  //.then((result) => res.json(result))
                  .catch((error) => {
                    res.status(412).json({
                      msg: error.message,
                    });
                  });
              }

              if (data.responseExSave.error) {
                console.log("No enviado - error");
                const errMsg = data.responseExSave.error.slice(0, 17);
                if (errMsg === "Escanee el código") {
                  updateEstatusERROR(turnoId, 104);
                  //console.log("Error 104: ", data.responseExSave.error);
                }
                // Sesion cerrada o desvinculada. Puede que se envie al abrir la sesion o al vincular
                if (errMsg === "Protocol error (R") {
                  updateEstatusERROR(turnoId, 105);
                  //console.log("Error 105: ", data.responseExSave.error);
                }
                // El numero esta mal escrito o supera los 12 caracteres
                if (errMsg === "Evaluation failed") {
                  updateEstatusERROR(turnoId, 106);
                  //console.log("Error 106: ", data.responseExSave.error);
                }
              }
            })
            .catch((error) => {
              console.error("Ocurrió un error:", error);
            });
        });

      await retraso();
    }
    console.log("Fin del envío");
    console.log("Luego de 1m se vuelve a consultar al PGSQL");
    setTimeout(() =>{
      iniciarEnvio();
    }, 10000)
  }

  function updateEstatusERROR(turnoId, cod_error) {
    // Se actualiza el estado segun el errors
    const body = {
      estado_envio: cod_error,
    };

    Tickets.update(body, {
      where: { id_turno: turnoId },
    })
      //.then((result) => res.json(result))
      .catch((error) => {
        res.status(412).json({
          msg: error.message,
        });
      });
  }

  /*
    Metodos
  */

  app
    .route("/tickets")
    .get((req, res) => {
      Tickets.findAll({
        order: [["createdAt", "DESC"]],
      })
        .then((result) => res.json(result))
        .catch((error) => {
          res.status(402).json({
            msg: error.menssage,
          });
        });
    })
    .post((req, res) => {
      console.log(req.body);
      Tickets.create(req.body)
        .then((result) => res.json(result))
        .catch((error) => res.json(error));
    });

  // Trae los turnos que tengan en el campo estado_envio = 0
  app.route("/ticketsPendientes").get((req, res) => {
    Tickets.findAll({
      where: { estado_envio: 0 },
      order: [["FECHA_CREACION", "ASC"]],
      //limit: 5
    })
      .then((result) => res.json(result))
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  });

  // Trae los turnos que ya fueron notificados hoy
  app.route("/ticketsNotificados").get((req, res) => {
    // Fecha de hoy 2022-02-30
    let fechaHoy = new Date().toISOString().slice(0, 10);

    Tickets.count({
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
      .then((result) => res.json(result))
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  });

  // Trae la cantidad de turnos enviados por rango de fecha desde hasta
  app.route("/ticketsNotificadosFecha").post((req, res) => {
    let fechaHoy = new Date().toISOString().slice(0, 10);
    let { fecha_desde, fecha_hasta } = req.body;

    if (fecha_desde === "" && fecha_hasta === "") {
      fecha_desde = fechaHoy;
      fecha_hasta = fechaHoy;
    }

    if (fecha_hasta == "") {
      fecha_hasta = fecha_desde;
    }

    if (fecha_desde == "") {
      fecha_desde = fecha_hasta;
    }

    console.log(req.body);

    Tickets.count({
      where: {
        [Op.and]: [
          { estado_envio: 1 },
          {
            updatedAt: {
              [Op.between]: [
                fecha_desde + " 00:00:00",
                fecha_hasta + " 23:59:59",
              ],
            },
          },
        ],
      },
      //order: [["createdAt", "DESC"]],
    })
      .then((result) => res.json(result))
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  });

  // Turnos no enviados - estado_envio 2 o 3
  app.route("/ticketsNoNotificados").get((req, res) => {
    // Fecha de hoy 2022-02-30
    let fechaHoy = new Date().toISOString().slice(0, 10);
    Tickets.count({
      where: {
        [Op.and]: [
          { estado_envio: { [Op.in]: [2, 3] } },
          {
            updatedAt: {
              [Op.between]: [fechaHoy + " 00:00:00", fechaHoy + " 23:59:59"],
            },
          },
        ],
      },
      //order: [["FECHA_CREACION", "DESC"]],
    })
      .then((result) => res.json(result))
      .catch((error) => {
        res.status(402).json({
          msg: error.menssage,
        });
      });
  });

  // // Trae la cantidad de turnos enviados por rango de fecha desde hasta
  // app.route("/turnosNoNotificadosFecha").post((req, res) => {
  //   let fechaHoy = new Date().toISOString().slice(0, 10);
  //   let { fecha_desde, fecha_hasta } = req.body;

  //   if (fecha_desde === "" && fecha_hasta === "") {
  //     fecha_desde = fechaHoy;
  //     fecha_hasta = fechaHoy;
  //   }

  //   if (fecha_hasta == "") {
  //     fecha_hasta = fecha_desde;
  //   }

  //   if (fecha_desde == "") {
  //     fecha_desde = fecha_hasta;
  //   }

  //   console.log(req.body);

  //   Turnos.count({
  //     where: {
  //       [Op.and]: [
  //         { estado_envio: { [Op.in]: [2, 3] } },
  //         {
  //           updatedAt: {
  //             [Op.between]: [
  //               fecha_desde + " 00:00:00",
  //               fecha_hasta + " 23:59:59",
  //             ],
  //           },
  //         },
  //       ],
  //     },
  //     //order: [["createdAt", "DESC"]],
  //   })
  //     .then((result) => res.json(result))
  //     .catch((error) => {
  //       res.status(402).json({
  //         msg: error.menssage,
  //       });
  //     });
  // });

  app
    .route("/tickets/:id_turno")
    .get((req, res) => {
      Tickets.findOne({
        where: req.params,
        include: [
          {
            model: Users,
            attributes: ["user_fullname"],
          },
        ],
      })
        .then((result) => res.json(result))
        .catch((error) => {
          res.status(404).json({
            msg: error.message,
          });
        });
    })
    .put((req, res) => {
      Tickets.update(req.body, {
        where: req.params,
      })
        .then((result) => res.json(result))
        .catch((error) => {
          res.status(412).json({
            msg: error.message,
          });
        });
    })
    .delete((req, res) => {
      //const id = req.params.id;
      Tickets.destroy({
        where: req.params,
      })
        .then(() => res.json(req.params))
        .catch((error) => {
          res.status(412).json({
            msg: error.message,
          });
        });
    });
};
